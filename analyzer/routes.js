// routes.js — HTTP surface for the Analyzer, mounted under /api by server.js.
//
//   POST /api/analyze            { url } | { text, byline?, outlet?, title? }
//   GET  /api/analysis/:id       stored analysis (public by id)
//   GET  /api/writer?key=...     writer aggregate profile
//   GET  /api/source?domain=...  source aggregate profile
//   GET  /api/analyzer/stats     provider/rubric/month-spend/queue/recent
//   GET  /api/rubric             the published rubric text + hash (Data page)
//
// Self-contained (own JSON/body helpers) so integration is a single call.

const { URL } = require("url");
const rubric = require("./rubric");
const provider = require("./provider");
const analyze = require("./analyze");
const store = require("./store");
const budget = require("./budget");

const MAX_BODY = 200 * 1024; // analyzer bodies (pasted articles) are larger than crowd bodies

let ready = false;
function init(axisKeys, leftRightFn) {
  store.init(axisKeys, process.env.ANALYSES_FILE || require("path").join(__dirname, "..", "store", "analyses.jsonl"), leftRightFn);
  budget.init(process.env.USAGE_FILE || require("path").join(__dirname, "..", "store", "analyzer-usage.jsonl"));
  analyze.init(axisKeys);
  ready = true;
}

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "", size = 0;
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error("body too large")); req.destroy(); return; } data += c; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}
// Admin = a signed-in admin account (cookie session) OR a request carrying
// x-analyzer-admin matching ANALYZER_ADMIN_KEY. Operator-only detail (model,
// token usage, spend, hashes) and force re-runs are gated on this.
function isAdmin(req) {
  const k = (process.env.ANALYZER_ADMIN_KEY || "").trim();
  if (k.length > 0 && req.headers["x-analyzer-admin"] === k) return true;
  try { return require("../auth/routes").isAdminSession(req); } catch { return false; }
}

// Returns true if this request was (or will be) handled here.
async function handle(req, res, urlPath) {
  if (!ready) return false;

  if (urlPath === "/api/rubric" && req.method === "GET") {
    // Publish only the methodology summary. The scoring prompt and its hash are
    // not returned.
    sendJson(res, 200, { summary: rubric.rubricSummary() });
    return true;
  }

  if (urlPath === "/api/analyzer/stats" && req.method === "GET") {
    const m = budget.monthStats();
    // Public: only a friendly analysis count + the recent list. No model, tokens,
    // spend, queue internals, or hashes.
    const out = { month: { month: m.month, analyses: m.analyses }, counts: store.counts(), recent: store.recentList(30) };
    if (isAdmin(req)) {
      out.provider = provider.status();
      out.rubric = { version: rubric.RUBRIC_VERSION, sha256: rubric.rubricShort() };
      out.month = m;
      out.queue = analyze.queueDepth();
    }
    sendJson(res, 200, out);
    return true;
  }

  if (urlPath === "/api/analysis/" || urlPath.startsWith("/api/analysis/")) {
    if (req.method !== "GET") { sendJson(res, 405, { error: "method not allowed" }); return true; }
    const id = urlPath.slice("/api/analysis/".length);
    const rec = store.getById(id);
    if (!rec) { sendJson(res, 404, { error: "no such analysis" }); return true; }
    // Strip operator-only provenance (model, hash) from the public record; keep
    // the human-facing rubric version only.
    const out = { ...rec, rubric: rec.rubric ? { version: rec.rubric.version } : null };
    delete out.usage;
    delete out.injection; // still reflected via flags/notice; raw field not needed client-side
    sendJson(res, 200, { analysis: out });
    return true;
  }

  if (urlPath === "/api/writer" && req.method === "GET") {
    const q = new URL(req.url, "http://x").searchParams;
    const prof = store.writerProfile(q.get("key") || "");
    if (!prof) { sendJson(res, 404, { error: "no such writer" }); return true; }
    sendJson(res, 200, { profile: prof });
    return true;
  }

  if (urlPath === "/api/source" && req.method === "GET") {
    const q = new URL(req.url, "http://x").searchParams;
    const prof = store.sourceProfile((q.get("domain") || "").toLowerCase());
    if (!prof) { sendJson(res, 404, { error: "no such source" }); return true; }
    sendJson(res, 200, { profile: prof });
    return true;
  }

  if (urlPath === "/api/analyze" && req.method === "POST") {
    try {
      const p = JSON.parse((await readBody(req)) || "{}");
      const url = typeof p.url === "string" ? p.url.trim() : "";
      const text = typeof p.text === "string" ? p.text : "";
      if (!url && !text) { sendJson(res, 400, { error: "provide a url or article text" }); return true; }
      if (url && !/^https?:\/\//i.test(url)) { sendJson(res, 400, { error: "url must start with http:// or https://" }); return true; }

      // Owner test bypass: skips the per-IP rate limit (see isAdmin).
      const admin = isAdmin(req);

      const out = await analyze.submit({
        ip: clientIp(req),
        url: url || null,
        text: url ? null : text,
        meta: { byline: p.byline, outlet: p.outlet, title: p.title },
        admin,
        force: admin && !!p.force, // force fresh re-scan (bypass dedupe) — admin only
      });
      sendJson(res, 200, { ok: true, id: out.id, existing: !!out.existing });
    } catch (e) {
      const code = e.code === "rate" ? 429 : e.code === "queue" ? 503 : e.code === "budget" ? 503 : 400;
      sendJson(res, code, { error: e.message });
    }
    return true;
  }

  return false;
}

module.exports = { init, handle };
