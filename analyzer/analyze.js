// analyze.js — the analysis pipeline and its abuse controls.
//
// Abuse controls:
//   * per-IP rate limit: 5 submissions/hour.
//   * global queue cap: 50 pending jobs.
//   * a single serial worker (one model call at a time — cost and rate safety).
//   * URL-level dedupe: re-submitting a URL already analyzed returns the stored
//     analysis immediately, spending no tokens.
//
// Pipeline per job:
//   1. URL jobs: SSRF-safe fetch + readability extraction (body is transient).
//   2. Budget gate: refuse if the month's estimated spend has hit the cap.
//   3. One model call with the cached rubric system prompt; on JSON parse
//      failure, ONE repair retry; then fail visibly.
//   4. Validate (evidence substring, axis count, ±100, injection).
//   5. Log usage; persist scores + metadata + evidence quotes (never the body).

const rubric = require("./rubric");
const provider = require("./provider");
const fetchUrl = require("./fetch-url");
const { validateAnalysis } = require("./validate");
const store = require("./store");
const budget = require("./budget");

const RATE_MAX = 5;               // submissions
const RATE_WINDOW_MS = 60 * 60 * 1000; // per hour
const QUEUE_CAP = 50;
const MAX_TEXT_CHARS = 60_000;

let AXIS_KEYS = [];
const queue = [];
let working = false;
const ipHits = new Map(); // ip -> [timestamps]

function init(axisKeys) { AXIS_KEYS = axisKeys; }

// ---- rate limiting -------------------------------------------------------
function rateAllow(ip) {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) { ipHits.set(ip, arr); return false; }
  arr.push(now);
  ipHits.set(ip, arr);
  return true;
}

// ---- JSON extraction -----------------------------------------------------
function extractJson(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

function buildUser(meta, article, repair) {
  const line = `url: ${meta.url || "—"}  byline: ${meta.byline || "unknown"}  outlet: ${meta.domain || "unknown"}`;
  const body = `${line}\n<article>\n${article}\n</article>`;
  if (!repair) return body;
  return `${body}\n\n(Your previous reply could not be parsed. Return ONLY the strict JSON object defined in your instructions — no prose, no code fences.)`;
}

// ---- the core (runs inside the serial worker) ----------------------------
async function runJob(job) {
  let meta, article, title;

  if (job.kind === "url") {
    const ext = await fetchUrl.fetchAndExtract(job.url);
    article = ext.text;
    title = ext.title;
    meta = { url: job.url, byline: ext.byline, domain: ext.domain };
  } else {
    article = String(job.text || "").slice(0, MAX_TEXT_CHARS);
    if (article.trim().length < 120) throw new Error("article text is too short to analyze");
    title = job.meta && job.meta.title ? String(job.meta.title).slice(0, 300) : null;
    const outlet = job.meta && job.meta.outlet ? fetchUrl.registrableDomain(String(job.meta.outlet)) : null;
    meta = { url: null, byline: job.meta && job.meta.byline ? String(job.meta.byline).slice(0, 120) : null, domain: outlet || null };
  }

  // Budget gate — checked here so it also covers queued jobs.
  if (budget.overBudget()) { const e = new Error("monthly analysis budget reached"); e.code = "budget"; throw e; }

  const system = rubric.rubricText();
  const model = provider.config().model;

  // First attempt, then one repair retry on parse failure.
  let parsed = null, usage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  for (let attempt = 0; attempt < 2 && parsed === null; attempt++) {
    const res = await provider.callModel({ system, user: buildUser(meta, article, attempt === 1) });
    // accumulate usage across attempts (each call is billed)
    usage.input += res.usage.input; usage.output += res.usage.output;
    usage.cacheRead += res.usage.cacheRead; usage.cacheCreation += res.usage.cacheCreation;
    parsed = extractJson(res.text);
  }
  budget.record(usage, model); // log usage even if parsing ultimately failed

  if (parsed === null) throw new Error("model did not return valid JSON after a repair attempt");

  const v = validateAnalysis(parsed, article, AXIS_KEYS);
  // Forced re-run of a URL that already has an analysis: replace it in place so
  // the id/link stays stable and no duplicate row is created.
  const replaceId = job.kind === "url" && job.force && meta.url
    ? (store.getByUrl(meta.url) || {}).id
    : null;
  const rec = store.addAnalysis({
    replaceId,
    url: meta.url,
    title,
    byline: meta.byline,
    domain: meta.domain,
    analysis: v.analysis,
    flagged: v.flagged,
    injection: v.injection,
    rubric: rubric.rubricStamp(model),
    usage,
  });
  return { id: rec.id };
}

// ---- serial worker -------------------------------------------------------
async function pump() {
  if (working) return;
  working = true;
  while (queue.length) {
    const job = queue.shift();
    try { job.resolve(await runJob(job)); }
    catch (err) { job.reject(err); }
  }
  working = false;
}

// Public entry. Returns { dedupe?, id, existing? } or throws with .code.
// `admin` (owner testing, via a matched ANALYZER_ADMIN_KEY header) skips the
// per-IP rate limit; the queue cap and serial worker still apply. `force` (admin
// only) bypasses URL dedupe to run a fresh scan (e.g. after a rubric/model change).
async function submit({ ip, url, text, meta, admin, force }) {
  // URL dedupe first — cheap, spends no tokens, not rate-limited. Skipped when
  // an admin forces a fresh re-scan.
  if (url && !force) {
    const existing = store.getByUrl(url);
    if (existing) return { id: existing.id, existing: true };
  }
  if (!admin && !rateAllow(ip || "unknown")) { const e = new Error("rate limit: 5 submissions per hour"); e.code = "rate"; throw e; }
  if (queue.length >= QUEUE_CAP) { const e = new Error("analysis queue is full, try again shortly"); e.code = "queue"; throw e; }

  const job = url ? { kind: "url", url, force: !!force } : { kind: "text", text, meta };
  const p = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
  queue.push(job);
  pump();
  const out = await p;
  return { id: out.id, existing: false };
}

function queueDepth() { return queue.length; }

module.exports = { init, submit, queueDepth, extractJson, QUEUE_CAP, RATE_MAX };
