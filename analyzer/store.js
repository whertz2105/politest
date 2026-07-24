// store.js — append-only JSONL store for article analyses, plus writer/source
// aggregation. We persist ONLY: scores, metadata (url, title, byline, domain,
// genre), the rubric provenance stamp, per-axis evidence quotes (≤25 words) and
// token usage. The full article body is NEVER stored or republished.
//
// Aggregation has three levels:
//   * article  — a single analysis, addressed by its id.
//   * writer   — keyed by normalized byline + registrable domain.
//   * source   — keyed by registrable domain.
// Writer/source aggregate axes are a per-axis mean with n; an axis is reported
// only when at least MIN_ARTICLES (3) analyses contributed a score to it.
// Flagged analyses (caution badge) are excluded from every aggregate.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const MIN_ARTICLES = 3;

let AXIS_KEYS = [];
let STORE_FILE = "";
const analyses = [];          // full records, in insertion order
const byId = new Map();       // id -> record
const byUrl = new Map();      // normalized url -> id (dedupe)

function init(axisKeys, storeFile) {
  AXIS_KEYS = axisKeys;
  STORE_FILE = storeFile;
  load();
}

function newId() { return crypto.randomBytes(6).toString("hex"); }

// Canonical URL form for dedupe: drop fragment + tracking params, lowercase host.
function normalizeUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const drop = [];
    url.searchParams.forEach((_, k) => { if (/^utm_/i.test(k) || /^(fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i.test(k)) drop.push(k); });
    drop.forEach((k) => url.searchParams.delete(k));
    url.pathname = url.pathname.replace(/\/+$/, "") || "/"; // strip trailing slash before query
    return url.toString();
  } catch { return null; }
}

function normalizeName(name) {
  return String(name || "").toLowerCase().replace(/^\s*by\s+/i, "").replace(/\s+/g, " ").trim();
}
function writerKeyOf(byline, domain) {
  const n = normalizeName(byline);
  if (!n || !domain) return null;
  return `${n}|${domain}`;
}

function persist(rec) {
  fs.appendFile(STORE_FILE, JSON.stringify(rec) + "\n", (err) => { if (err) console.error("analysis append failed:", err.message); });
}
function load() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    if (!fs.existsSync(STORE_FILE)) return;
    for (const line of fs.readFileSync(STORE_FILE, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { index(JSON.parse(line)); } catch {}
    }
    console.log(`loaded ${analyses.length} analyses from ${STORE_FILE}`);
  } catch (e) { console.error("analysis load failed:", e.message); }
}
function index(rec) {
  if (!rec || !rec.id) return;
  analyses.push(rec);
  byId.set(rec.id, rec);
  if (rec.url) { const n = normalizeUrl(rec.url); if (n && !byUrl.has(n)) byUrl.set(n, rec.id); }
}

// Store a completed analysis. `input` carries everything already validated.
function addAnalysis(input) {
  const rec = {
    id: newId(),
    ts: new Date().toISOString(),
    url: input.url || null,
    title: input.title || null,
    writer: input.byline || null,
    source: input.domain || null,
    writerKey: writerKeyOf(input.byline, input.domain),
    genre: input.analysis.genre,
    stance_detected: input.analysis.stance_detected,
    axes: input.analysis.axes,        // { key: {score, confidence, evidence} }
    neutral_summary: input.analysis.neutral_summary || "",
    summary: input.analysis.summary,
    flags: input.analysis.flags,
    flagged: input.flagged,
    injection: input.injection,
    rubric: input.rubric,             // {version, sha256, model}
    usage: input.usage,
  };
  index(rec);
  persist(rec);
  return rec;
}

function getById(id) { return byId.get(id) || null; }
function getByUrl(u) {
  const n = normalizeUrl(u);
  if (!n) return null;
  const id = byUrl.get(n);
  return id ? byId.get(id) : null;
}

// Aggregate a set of (non-flagged) records into per-axis mean+n.
function aggregate(records) {
  const acc = {};
  for (const k of AXIS_KEYS) acc[k] = { sum: 0, n: 0 };
  for (const r of records) {
    if (r.flagged) continue;
    for (const k of Object.keys(r.axes || {})) {
      if (!acc[k]) continue;
      const s = r.axes[k].score;
      if (typeof s === "number") { acc[k].sum += s; acc[k].n += 1; }
    }
  }
  const axes = {};
  for (const k of AXIS_KEYS) {
    if (acc[k].n > 0) axes[k] = { mean: Math.round(acc[k].sum / acc[k].n), n: acc[k].n };
  }
  return axes;
}

function articleCard(r) {
  return { id: r.id, title: r.title, url: r.url, genre: r.genre, stance_detected: r.stance_detected, flagged: r.flagged, ts: r.ts };
}

function writerProfile(writerKey) {
  const recs = analyses.filter((r) => r.writerKey === writerKey);
  if (!recs.length) return null;
  const contributing = recs.filter((r) => !r.flagged);
  const sample = recs[0];
  return {
    kind: "writer",
    writerKey,
    name: sample.writer,
    domain: sample.source,
    articleCount: contributing.length,
    minArticles: MIN_ARTICLES,
    axes: aggregate(recs),
    articles: recs.map(articleCard).reverse(),
  };
}

function sourceProfile(domain) {
  const recs = analyses.filter((r) => r.source === domain);
  if (!recs.length) return null;
  const contributing = recs.filter((r) => !r.flagged);
  return {
    kind: "source",
    domain,
    articleCount: contributing.length,
    minArticles: MIN_ARTICLES,
    axes: aggregate(recs),
    articles: recs.map(articleCard).reverse(),
  };
}

function recentList(limit) {
  return analyses.slice(-Math.max(1, limit || 30)).reverse().map(articleCard);
}

function counts() {
  return { analyses: analyses.length, writers: new Set(analyses.map((r) => r.writerKey).filter(Boolean)).size, sources: new Set(analyses.map((r) => r.source).filter(Boolean)).size };
}

module.exports = {
  init, addAnalysis, getById, getByUrl, normalizeUrl, writerKeyOf, normalizeName,
  writerProfile, sourceProfile, recentList, counts, MIN_ARTICLES,
};
