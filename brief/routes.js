// routes.js (brief) — HTTP surface for the Daily Brief, mounted under /api/brief.
//
//   GET  /api/brief/latest            latest PUBLISHED brief (public)
//   GET  /api/brief?date=YYYY-MM-DD    a published brief by date (public)
//   GET  /api/brief/admin/list         all briefs incl. drafts (admin)
//   POST /api/brief/admin/edit         edit an item; marks it uncertified (admin)
//   POST /api/brief/admin/recertify    re-run certification on edited items (admin)
//   POST /api/brief/admin/approve      publish if every item is certified (admin)
//
// Public responses strip token usage and the review queue. Admin = the same gate as
// the Analyzer (ANALYZER_ADMIN_KEY header or an admin cookie session).

const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const store = require("./store");

const MAX_BODY = 64 * 1024;
let ready = false;
let FEED_DIR = "";               // feed.xml lives beside the briefs store (writable)
let FEED_ORIGIN = "https://politeion.com";

function init(webRoot, briefsFile, opts = {}) {
  // The web root is read-only under systemd hardening, so feed.xml is written into
  // the (writable) store dir and served by this app at /feed.xml.
  FEED_DIR = path.dirname(briefsFile);
  if (opts.feedOrigin) FEED_ORIGIN = opts.feedOrigin;
  store.init(briefsFile);
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
function isAdmin(req) {
  const k = (process.env.ANALYZER_ADMIN_KEY || "").trim();
  if (k.length > 0 && req.headers["x-analyzer-admin"] === k) return true;
  try { return require("../auth/routes").isAdminSession(req); } catch { return false; }
}
function allCertified(b) { return (b.review || []).length === 0 && (b.items || []).every((it) => it.certOk); }

async function handle(req, res, urlPath) {
  if (!ready) return false;

  // The RSS feed, served from the writable store dir (see init).
  if (urlPath === "/feed.xml" && req.method === "GET") {
    fs.readFile(path.join(FEED_DIR, "feed.xml"), (err, data) => {
      if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("no feed yet"); return; }
      res.writeHead(200, { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(data);
    });
    return true;
  }

  if (!urlPath.startsWith("/api/brief")) return false;

  if (urlPath === "/api/brief/latest" && req.method === "GET") {
    sendJson(res, 200, { brief: store.publicBrief(store.latestPublished()), recent: store.publishedList(20).map((b) => ({ id: b.id, date: b.date })) });
    return true;
  }

  if ((urlPath === "/api/brief" || urlPath === "/api/brief/") && req.method === "GET") {
    const date = new URL(req.url, "http://x").searchParams.get("date") || "";
    const b = store.getByDate(date);
    if (!b || b.status !== "published") { sendJson(res, 404, { error: "no published brief for that date" }); return true; }
    sendJson(res, 200, { brief: store.publicBrief(b), recent: store.publishedList(20).map((x) => ({ id: x.id, date: x.date })) });
    return true;
  }

  // ---- admin ----
  if (urlPath.startsWith("/api/brief/admin/")) {
    if (!isAdmin(req)) { sendJson(res, 403, { error: "admin only" }); return true; }

    if (urlPath === "/api/brief/admin/list" && req.method === "GET") {
      sendJson(res, 200, { briefs: store.all().map((b) => ({ id: b.id, date: b.date, status: b.status, brief_version: b.brief_version, items: b.items || [], review: b.review || [], today: b.today || [], certifiable: allCertified(b) })) });
      return true;
    }

    if (urlPath === "/api/brief/admin/edit" && req.method === "POST") {
      const p = JSON.parse((await readBody(req)) || "{}");
      const b = store.getById(p.id);
      if (!b) { sendJson(res, 404, { error: "no such brief" }); return true; }
      // Edits address the combined item list (items + review) by index.
      const pool = [...(b.items || []), ...(b.review || [])];
      const it = pool[Number(p.index)];
      if (!it) { sendJson(res, 400, { error: "bad item index" }); return true; }
      if (typeof p.headline === "string") it.headline = p.headline.slice(0, 90);
      if (typeof p.summary === "string") it.summary = p.summary;
      if (typeof p.why_it_matters === "string") it.why_it_matters = p.why_it_matters.slice(0, 240);
      // An edited item must be re-certified before it can be approved.
      it.certOk = false; it.needsHuman = true;
      b.items = pool.filter((x) => x.certOk);
      b.review = pool.filter((x) => !x.certOk);
      store.save(b);
      sendJson(res, 200, { ok: true, certifiable: allCertified(b) });
      return true;
    }

    if (urlPath === "/api/brief/admin/remove" && req.method === "POST") {
      const p = JSON.parse((await readBody(req)) || "{}");
      const b = store.getById(p.id);
      if (!b) { sendJson(res, 404, { error: "no such brief" }); return true; }
      // Drop an item entirely (e.g. one that won't pass the neutrality gate) so the
      // rest of the brief can be approved. Index is into the combined items+review list.
      const pool = [...(b.items || []), ...(b.review || [])];
      const idx = Number(p.index);
      if (!pool[idx]) { sendJson(res, 400, { error: "bad item index" }); return true; }
      pool.splice(idx, 1);
      b.items = pool.filter((x) => x.certOk);
      b.review = pool.filter((x) => !x.certOk);
      store.save(b);
      sendJson(res, 200, { ok: true, certifiable: allCertified(b) });
      return true;
    }

    if (urlPath === "/api/brief/admin/recertify" && req.method === "POST") {
      const p = JSON.parse((await readBody(req)) || "{}");
      const b = store.getById(p.id);
      if (!b) { sendJson(res, 404, { error: "no such brief" }); return true; }
      const draft = require("./draft");
      try { await draft.recertify(b); }
      catch (e) { sendJson(res, 503, { error: "certification failed: " + e.message }); return true; }
      sendJson(res, 200, { ok: true, certifiable: allCertified(b), items: b.items, review: b.review });
      return true;
    }

    if (urlPath === "/api/brief/admin/approve" && req.method === "POST") {
      const p = JSON.parse((await readBody(req)) || "{}");
      const b = store.getById(p.id);
      if (!b) { sendJson(res, 404, { error: "no such brief" }); return true; }
      if (!allCertified(b)) { sendJson(res, 400, { error: "every item must be certified before approval" }); return true; }
      b.status = "published"; b.approved_at = new Date().toISOString();
      store.save(b);
      const wrote = store.writeFeed(FEED_DIR, { origin: FEED_ORIGIN });
      sendJson(res, 200, { ok: true, published: b.date, feed: wrote });
      return true;
    }

    sendJson(res, 404, { error: "no such brief admin endpoint" });
    return true;
  }

  return false;
}

module.exports = { init, handle };
