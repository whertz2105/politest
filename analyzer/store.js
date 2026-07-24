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
let leftRightFn = null;       // injected from server.js (shared js/leftright.js)
const analyses = [];          // full records, in insertion order
const byId = new Map();       // id -> record
const byUrl = new Map();      // normalized url -> id (dedupe)

function init(axisKeys, storeFile, lrFn) {
  AXIS_KEYS = axisKeys;
  STORE_FILE = storeFile;
  leftRightFn = typeof lrFn === "function" ? lrFn : null;
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
  // Dedupe by id: a re-run persists a fresh line with the SAME id, and load()
  // replays oldest→newest, so the latest version wins and there is never a
  // duplicate row for the same analysis.
  const existing = byId.get(rec.id);
  if (existing) {
    const i = analyses.indexOf(existing);
    if (i >= 0) analyses[i] = rec; else analyses.push(rec);
  } else {
    analyses.push(rec);
  }
  byId.set(rec.id, rec);
  if (rec.url) { const n = normalizeUrl(rec.url); if (n) byUrl.set(n, rec.id); }
}

// Store a completed analysis. `input` carries everything already validated.
// If input.replaceId names an existing analysis (a forced re-run), the record is
// updated IN PLACE under the same id — so its URL/link stays stable and no
// duplicate row appears in any list.
function addAnalysis(input) {
  const reuse = input.replaceId && byId.has(input.replaceId);
  const rec = {
    id: reuse ? input.replaceId : newId(),
    ts: new Date().toISOString(),
    url: input.url || null,
    title: input.title || null,
    writer: input.byline || null,
    source: input.domain || null,
    writerKey: writerKeyOf(input.byline, input.domain),
    origin: input.origin || null,     // "brief" | "candidate" = internal, non-public analyses
    candidateId: input.candidateId || null, // set for origin "candidate"
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

// Aggregate left–right for a set of records = the MEAN of each non-flagged
// article's own left–right position (over its full axis set). Articles with no
// detected lean are excluded so straight reports don't drag the mean to center.
function aggregateLR(records) {
  if (!leftRightFn) return { x: 0, hasSignal: false, n: 0 };
  let sum = 0, n = 0;
  for (const r of records) {
    if (r.flagged) continue;
    const s = leftRightFn(r.axes || {});
    if (s && s.hasSignal) { sum += s.x; n++; }
  }
  return { x: n ? Math.round(sum / n) : 0, hasSignal: n > 0, n };
}

function articleCard(r) {
  const card = { id: r.id, title: r.title, url: r.url, source: r.source || null, genre: r.genre, stance_detected: r.stance_detected, flagged: r.flagged, ts: r.ts };
  // Precomputed left↔right position for list mini-bars (flagged excluded — no lean shown).
  if (leftRightFn && !r.flagged) card.lr = leftRightFn(r.axes || {});
  return card;
}

// ---- time series (outlet / writer drift) ---------------------------------
// Buckets analyses over time so a source's or writer's position can be tracked.
// The honest reading is WITHIN a genre: composition drift (an op-ed-heavy month)
// otherwise masquerades as position drift in the all-genre line. A bucket renders
// only at n >= MIN_ARTICLES; sparser months are omitted, not shown thin.
const GENRE_LIST = ["report", "analysis", "opinion", "mixed"];

function monthKeyOf(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Group already-non-flagged records into ordered monthly buckets (n >= MIN_ARTICLES).
// Each bucket: { period, n, byGenre:{report,…}, lr:mean, axes:{key:{mean,n}} }.
function bucketByMonth(records) {
  const map = new Map();
  for (const r of records) {
    const p = monthKeyOf(r.ts);
    if (!p) continue;
    if (!map.has(p)) map.set(p, []);
    map.get(p).push(r);
  }
  const out = [];
  for (const [period, recs] of [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (recs.length < MIN_ARTICLES) continue;
    const byGenre = {};
    for (const g of GENRE_LIST) byGenre[g] = 0;
    for (const r of recs) if (byGenre[r.genre] !== undefined) byGenre[r.genre]++;
    out.push({ period, n: recs.length, byGenre, lr: aggregateLR(recs).x, axes: aggregate(recs) });
  }
  return out;
}

// Public trend for a source (kind="source", key=domain) or writer (kind="writer",
// key=writerKey). Returns both the all-genre series and per-genre series (each
// bucketed independently, each honoring the n>=MIN_ARTICLES floor), or null if the
// subject has no non-flagged analyses. Carries only aggregate means/counts — no
// bodies, no usage, no operator detail.
function timeSeries(kind, key, opts = {}) {
  const recs = analyses.filter((r) => !r.flagged && !r.origin && (kind === "writer" ? r.writerKey === key : r.source === key));
  if (!recs.length) return null;
  const byGenre = {};
  for (const g of GENRE_LIST) byGenre[g] = bucketByMonth(recs.filter((r) => r.genre === g));
  return { kind, key, bucket: opts.bucket || "month", all: bucketByMonth(recs), byGenre };
}

function writerProfile(writerKey) {
  // Only public scans (origin null) — a candidate/brief analysis never forms a
  // writer profile even if it happens to carry a byline.
  const recs = analyses.filter((r) => r.writerKey === writerKey && !r.origin);
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
    lr: aggregateLR(recs),
    articles: recs.map(articleCard).reverse(),
  };
}

function sourceProfile(domain) {
  // Only public scans — a floor speech fetched from tuberville.senate.gov (origin
  // "candidate") must NEVER mint a "senate.gov" outlet profile.
  const recs = analyses.filter((r) => r.source === domain && !r.origin);
  if (!recs.length) return null;
  const contributing = recs.filter((r) => !r.flagged);
  return {
    kind: "source",
    domain,
    articleCount: contributing.length,
    minArticles: MIN_ARTICLES,
    axes: aggregate(recs),
    lr: aggregateLR(recs),
    articles: recs.map(articleCard).reverse(),
  };
}

// Rank sources / writers by how far their average lean sits from center.
// `min` = minimum number of analyzed articles WITH a detected stance to qualify.
function groupBy(keyFn) {
  const m = new Map();
  // origin-tagged analyses (brief, candidate) never enter the leaderboard.
  for (const r of analyses) { if (r.origin) continue; const k = keyFn(r); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}
function rankSources(limit, min) {
  min = min || MIN_ARTICLES;
  const out = [];
  for (const [domain, recs] of groupBy((r) => r.source)) {
    const lr = aggregateLR(recs);
    if (lr.n >= min) out.push({ domain, lr, articleCount: recs.filter((r) => !r.flagged).length });
  }
  out.sort((a, b) => Math.abs(b.lr.x) - Math.abs(a.lr.x) || b.lr.n - a.lr.n);
  return out.slice(0, limit || 10);
}
function rankWriters(limit, min) {
  min = min || MIN_ARTICLES;
  const out = [];
  for (const [writerKey, recs] of groupBy((r) => r.writerKey)) {
    const lr = aggregateLR(recs);
    if (lr.n >= min) out.push({ writerKey, name: recs[0].writer, domain: recs[0].source, lr, articleCount: recs.filter((r) => !r.flagged).length });
  }
  out.sort((a, b) => Math.abs(b.lr.x) - Math.abs(a.lr.x) || b.lr.n - a.lr.n);
  return out.slice(0, limit || 10);
}

// Internal analyses (origin set: "brief" certification, "candidate" profiling) are
// not public article scans — keep them out of the recent list and the public counts.
const isPublicAnalysis = (r) => !r.origin;

function recentList(limit) {
  return analyses.filter(isPublicAnalysis).slice(-Math.max(1, limit || 30)).reverse().map(articleCard);
}

function counts() {
  const pub = analyses.filter(isPublicAnalysis);
  return { analyses: pub.length, writers: new Set(pub.map((r) => r.writerKey).filter(Boolean)).size, sources: new Set(pub.map((r) => r.source).filter(Boolean)).size };
}

// ---- candidate profiling (origin "candidate", keyed by candidateId) -------
// Mirrors the writer aggregate but over first-person candidate material only. Axes
// render at ≥ axisMin (2) contributing non-flagged analyses; the caller treats
// articleCount < CAND_PROFILE_MIN (3) as thin corpus. Every axis carries its
// evidence quotes + source links — receipts everywhere.
function hasCandidateAnalysis(url, candidateId) {
  const n = normalizeUrl(url);
  if (!n) return false;
  return analyses.some((r) => r.origin === "candidate" && r.candidateId === candidateId && r.url && normalizeUrl(r.url) === n);
}

function candidateProfile(candidateId, opts = {}) {
  const axisMin = opts.axisMin || 2;
  const recs = analyses.filter((r) => r.origin === "candidate" && r.candidateId === candidateId);
  // Aggregate PER AXIS over the axes whose OWN evidence quote verified. We exclude
  // only injection-compromised analyses — NOT whole analyses flagged for one
  // paraphrased/stitched quote or for spanning >8 axes (a candidate platform page
  // legitimately covers 10+; the article-analyzer's caps are calibrated for news).
  // Every rendered axis still carries a verified quote — receipts strengthened.
  const usable = recs.filter((r) => !r.injection);
  const acc = {};
  for (const k of AXIS_KEYS) acc[k] = { sum: 0, n: 0, evidence: [] };
  const contributed = new Set();
  let lrSum = 0, lrN = 0;
  for (const r of usable) {
    const verified = {};
    for (const k of Object.keys(r.axes || {})) {
      const a = r.axes[k];
      if (!acc[k] || typeof a.score !== "number" || a.evidenceOk === false) continue;
      acc[k].sum += a.score; acc[k].n += 1;
      contributed.add(r.id);
      verified[k] = { score: a.score, confidence: a.confidence };
      if (a.evidence && acc[k].evidence.length < 4) acc[k].evidence.push({ quote: a.evidence, url: r.url, title: r.title, score: a.score, analysisId: r.id });
    }
    if (leftRightFn) { const s = leftRightFn(verified); if (s && s.hasSignal) { lrSum += s.x; lrN++; } }
  }
  const axes = {};
  for (const k of AXIS_KEYS) if (acc[k].n >= axisMin) axes[k] = { mean: Math.round(acc[k].sum / acc[k].n), n: acc[k].n, evidence: acc[k].evidence };
  return {
    candidateId,
    articleCount: contributed.size,
    axisMin,
    profileMin: 3,
    axes,
    lr: { x: lrN ? Math.round(lrSum / lrN) : 0, hasSignal: lrN > 0, n: lrN },
    sources: usable.map((r) => ({ id: r.id, url: r.url, title: r.title, flagged: r.flagged })),
  };
}

module.exports = {
  init, addAnalysis, getById, getByUrl, normalizeUrl, writerKeyOf, normalizeName,
  writerProfile, sourceProfile, recentList, counts, rankSources, rankWriters, MIN_ARTICLES,
  timeSeries, bucketByMonth, monthKeyOf, candidateProfile, hasCandidateAnalysis,
};
