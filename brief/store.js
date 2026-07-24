// store.js (brief) — append-only JSONL store for daily briefs, plus item-schema
// validation and RSS 2.0 feed generation. A brief is small and edited/approved
// interactively, so the file is rewritten wholesale on save (low volume). We never
// store source article bodies — only the synthesized items and their receipts.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let FILE = "";
const briefs = [];
const byId = new Map();
const byDate = new Map();

function init(file) { FILE = file; load(); }
function newId() { return crypto.randomBytes(6).toString("hex"); }

function index(rec) {
  const ex = byId.get(rec.id);
  if (ex) { const i = briefs.indexOf(ex); if (i >= 0) briefs[i] = rec; else briefs.push(rec); }
  else briefs.push(rec);
  byId.set(rec.id, rec);
  byDate.set(rec.date, rec);
}
function load() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    if (!fs.existsSync(FILE)) return;
    for (const line of fs.readFileSync(FILE, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { index(JSON.parse(line)); } catch { /* skip corrupt line */ }
    }
    console.log(`loaded ${briefs.length} briefs from ${FILE}`);
  } catch (e) { console.error("brief load failed:", e.message); }
}
function rewriteAll() {
  const tmp = FILE + ".tmp";
  try {
    fs.writeFileSync(tmp, briefs.map((b) => JSON.stringify(b)).join("\n") + "\n");
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error("brief write failed:", e.message); }
}

// Upsert a brief (assigns an id if absent) and flush.
function save(rec) {
  if (!rec.id) rec.id = newId();
  index(rec);
  rewriteAll();
  return rec;
}

function getById(id) { return byId.get(id) || null; }
function getByDate(d) { return byDate.get(d) || null; }
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
function all() { return briefs.slice().sort(byDateDesc); }
function publishedList(limit) { return briefs.filter((b) => b.status === "published").sort(byDateDesc).slice(0, limit || 20); }
function latestPublished() { return publishedList(1)[0] || null; }

// Public projection: strip token usage (operator detail); keep item receipts.
function publicBrief(b) {
  if (!b) return null;
  const { usage, ...rest } = b;
  return { ...rest, items: (b.items || []).map(publicItem), review: undefined, today: b.today || [] };
}
function publicItem(it) { return { headline: it.headline, summary: it.summary, why_it_matters: it.why_it_matters, links: it.links || [], analysisId: it.analysisId || null, certOk: !!it.certOk, sources: it.sources || [] }; }

// ---- item schema validation ----------------------------------------------
function wordCount(s) { const t = String(s || "").trim(); return t ? t.split(/\s+/).length : 0; }
function validateItem(it) {
  const errors = [];
  if (!it || typeof it !== "object") return { ok: false, errors: ["not an object"] };
  if (typeof it.headline !== "string" || !it.headline.trim() || it.headline.length > 90) errors.push("headline missing or over 90 chars");
  const sw = wordCount(it.summary);
  if (sw < 40 || sw > 80) errors.push(`summary ${sw} words (need 40–80)`);
  if (wordCount(it.why_it_matters) > 30) errors.push(`why_it_matters ${wordCount(it.why_it_matters)} words (max 30)`);
  if (!Array.isArray(it.links) || !it.links.length || !it.links.every((l) => /^https?:\/\//i.test(l))) errors.push("links must be a non-empty array of http(s) URLs");
  return { ok: errors.length === 0, errors };
}

// ---- RSS 2.0 feed ---------------------------------------------------------
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function feedXml(list, opts = {}) {
  const origin = (opts.origin || "https://politeion.com").replace(/\/+$/, "");
  const items = (list || []).slice(0, 20).map((b) => {
    const link = `${origin}/brief.html?date=${esc(b.date)}`;
    const desc = (b.items || []).map((it) => `• ${esc(it.headline)}`).join("\n");
    let pub = "";
    try { pub = new Date(b.date + "T10:00:00Z").toUTCString(); } catch { pub = ""; }
    return `    <item>
      <title>Politeion Daily Brief — ${esc(b.date)}</title>
      <link>${link}</link>
      <guid isPermaLink="false">politeion-brief-${esc(b.id)}</guid>
      <pubDate>${esc(pub)}</pubDate>
      <description>${esc(desc)}</description>
    </item>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Politeion Daily Brief</title>
    <link>${origin}/brief.html</link>
    <description>A neutral daily brief, machine-certified for no detectable stance.</description>
${items}
  </channel>
</rss>
`;
}
function writeFeed(webRoot, opts) {
  try { fs.writeFileSync(path.join(webRoot, "feed.xml"), feedXml(publishedList(20), opts)); return true; }
  catch (e) { console.error("feed.xml write failed:", e.message); return false; }
}

module.exports = {
  init, save, getById, getByDate, all, publishedList, latestPublished,
  publicBrief, validateItem, feedXml, writeFeed,
};
