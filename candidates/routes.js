// routes.js (candidates) — HTTP surface, mounted under /api/candidates and /api/candidate.
//
//   GET  /api/candidates/registries   all parsed registries (+ validation errors)  [public]
//   GET  /api/candidate?id=<id>        registry metadata + aggregate profile        [public]
//   POST /api/candidates/ingest        { races?, state?, dryRun? } → run/plan        [admin]
//
// Public responses carry only aggregate means/counts + evidence quotes — the same
// receipts an article page shows. Candidate analyses never enter public aggregates
// (enforced in analyzer/store.js).

const { URL } = require("url");
const registry = require("./registry");
const store = require("../analyzer/store");

const MAX_BODY = 16 * 1024;
let ready = false;

function init() { ready = true; }

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
function isAdmin(req) {
  const k = (process.env.ANALYZER_ADMIN_KEY || "").trim();
  if (k.length > 0 && req.headers["x-analyzer-admin"] === k) return true;
  try { return require("../auth/routes").isAdminSession(req); } catch { return false; }
}

async function handle(req, res, urlPath) {
  if (!ready || !(urlPath === "/api/candidate" || urlPath.startsWith("/api/candidates"))) return false;

  if (urlPath === "/api/candidates/registries" && req.method === "GET") {
    sendJson(res, 200, { registries: registry.all() });
    return true;
  }

  if (urlPath === "/api/candidate" && req.method === "GET") {
    const id = new URL(req.url, "http://x").searchParams.get("id") || "";
    const entry = registry.candidate(id);
    if (!entry) { sendJson(res, 404, { error: "no such candidate" }); return true; }
    const { meta, cand, race } = entry;
    sendJson(res, 200, {
      candidate: {
        id: cand.id, name: cand.name, party: cand.party, status: cand.status, statusInfo: cand.statusInfo,
        incumbentOffice: cand.incumbentOffice, currentOffice: cand.currentOffice, sources: cand.sources,
        office: race ? race.office : (meta.office || null), district: race ? race.district : null,
        state: meta.state || null, cycle: meta.cycle,
      },
      profile: store.candidateProfile(id),
    });
    return true;
  }

  if (urlPath === "/api/candidates/ingest" && req.method === "POST") {
    if (!isAdmin(req)) { sendJson(res, 403, { error: "admin only" }); return true; }
    let p = {};
    try { p = JSON.parse((await readBody(req)) || "{}"); } catch { /* empty body ok */ }
    const filter = {};
    if (p.state) filter.state = String(p.state);
    if (Array.isArray(p.races) && p.races.length) filter.races = new Set(p.races.map((s) => String(s).toLowerCase()));
    const { ingest } = require("./ingest");
    try {
      const out = await ingest({ filter: Object.keys(filter).length ? filter : null, dryRun: !!p.dryRun });
      sendJson(res, 200, { ok: true, result: out });
    } catch (e) { sendJson(res, 503, { error: e.message }); }
    return true;
  }

  return false;
}

module.exports = { init, handle };
