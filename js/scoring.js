// scoring.js — question validation + score/validity computation.
// Unified answer format: every answer is an integer 0..100 (both Classic and
// Precision modes). Multiplier a = (s-50)/50 ∈ [-1,+1]; raw = Σ(a·weight);
// score = 100·raw / Σ|weight| over the active question set (one decimal).
import { AXIS_KEYS, isAxisKey, isLegacyKey, legacyToNew } from "./axes.js";

// Classic 5-button mode maps to the unified 0..100 scale.
export const CLASSIC_MAP = { "Strongly Disagree": 0, "Disagree": 25, "Neutral": 50, "Agree": 75, "Strongly Agree": 100 };
export const CLASSIC_ANSWERS = [
  { v: 100, label: "Strongly Agree", key: "1" },
  { v: 75, label: "Agree", key: "2" },
  { v: 50, label: "Neutral / Not Sure", key: "3" },
  { v: 25, label: "Disagree", key: "4" },
  { v: 0, label: "Strongly Disagree", key: "5" },
];

// Old -2..+2 answers migrate to the 0..100 scale.
export const LEGACY_ANSWER_MAP = { "-2": 0, "-1": 25, "0": 50, "1": 75, "2": 100 };
export function migrateAnswerValue(v) {
  if (v >= 0 && v <= 100) return v;            // already new-format
  const m = LEGACY_ANSWER_MAP[String(v)];
  return m === undefined ? 50 : m;
}

// ---------------------------------------------------------------------------
// Legacy question migration: remap old fused axis keys -> new split keys.
// Returns { questions, bankVersion: 1|2, approximatedAxes:[newKey] }.
// ---------------------------------------------------------------------------
export function migrateQuestions(raw) {
  if (!Array.isArray(raw)) return { questions: raw, bankVersion: 2, approximatedAxes: [] };
  const approximated = new Set();
  const questions = raw.map((q) => {
    if (!q || typeof q !== "object" || typeof q.axes !== "object" || q.axes === null) return q;
    const axes = {};
    for (const k of Object.keys(q.axes)) {
      if (isLegacyKey(k)) { axes[legacyToNew(k)] = q.axes[k]; approximated.add(legacyToNew(k)); }
      else axes[k] = q.axes[k];
    }
    return { ...q, axes };
  });
  return { questions, bankVersion: approximated.size ? 1 : 2, approximatedAxes: [...approximated] };
}

// ---------------------------------------------------------------------------
// Validation of the (untrusted) question file. Returns { questions, errors, warnings }.
// Tolerates optional fields sev/pair/type/expect/core when absent.
// ---------------------------------------------------------------------------
export function validateQuestions(raw) {
  const errors = [];
  const warnings = [];
  const questions = [];
  const seenIds = new Set();

  if (!Array.isArray(raw)) return { questions, errors: ["questions.json is not a JSON array."], warnings };

  raw.forEach((q, i) => {
    const where = `item ${i}` + (q && q.id != null ? ` (id ${q.id})` : "");
    if (typeof q !== "object" || q === null) { errors.push(`${where}: not an object.`); return; }
    if (!Number.isInteger(q.id)) { errors.push(`${where}: missing/invalid integer "id".`); return; }
    if (seenIds.has(q.id)) { errors.push(`item ${i}: duplicate id ${q.id}.`); return; }
    seenIds.add(q.id);
    if (typeof q.text !== "string" || q.text.trim() === "") { errors.push(`${where}: missing/empty "text".`); return; }

    const isAttention = q.type === "attention";
    if (q.type !== undefined && q.type !== "attention") {
      errors.push(`${where}: unknown "type" ${JSON.stringify(q.type)} (only "attention").`); return;
    }
    if (isAttention) {
      if (q.expect !== 0 && q.expect !== 100) { errors.push(`${where}: attention item needs "expect": 0 or 100.`); return; }
    } else {
      if (typeof q.axes !== "object" || q.axes === null || Array.isArray(q.axes)) { errors.push(`${where}: missing "axes" object.`); return; }
      const axisKeys = Object.keys(q.axes);
      if (axisKeys.length === 0) { errors.push(`${where}: "axes" is empty.`); return; }
      let ok = true;
      for (const k of axisKeys) {
        if (!isAxisKey(k)) { errors.push(`${where}: unknown axis key "${k}".`); ok = false; continue; }
        const w = q.axes[k];
        if (!Number.isInteger(w) || w < -2 || w > 2) { errors.push(`${where}: weight for "${k}" is ${w}; must be an integer in -2..2.`); ok = false; }
        else if (w === 0) warnings.push(`${where}: weight for "${k}" is 0 (no effect).`);
      }
      if (!ok) return;
    }

    // optional fields
    if (q.core !== undefined && typeof q.core !== "boolean") warnings.push(`${where}: "core" should be a boolean.`);
    if (q.anchor !== undefined && typeof q.anchor !== "boolean") warnings.push(`${where}: "anchor" should be a boolean.`);
    if (q.anchor && isAttention) warnings.push(`${where}: attention items cannot be anchors.`);
    if (q.sev !== undefined && ![1, 2, 3].includes(q.sev)) warnings.push(`${where}: "sev" should be 1, 2 or 3.`);
    if (q.pair !== undefined && (typeof q.pair !== "string" || !q.pair.trim())) warnings.push(`${where}: "pair" should be a non-empty string id.`);

    questions.push(q);
  });

  // consistency-pair integrity: exactly two items, same axis, opposite polarity.
  const pairs = new Map();
  for (const q of questions) {
    if (typeof q.pair === "string" && q.pair) {
      if (!pairs.has(q.pair)) pairs.set(q.pair, []);
      pairs.get(q.pair).push(q);
    }
  }
  for (const [pid, items] of pairs) {
    if (items.length !== 2) { warnings.push(`pair "${pid}": has ${items.length} items (expected exactly 2).`); continue; }
    const [a, b] = items;
    const ak = Object.keys(a.axes || {}), bk = Object.keys(b.axes || {});
    const shared = ak.filter((k) => bk.includes(k));
    if (shared.length !== 1) { warnings.push(`pair "${pid}": items should share exactly one axis.`); continue; }
    const k = shared[0];
    if (Math.sign(a.axes[k]) === Math.sign(b.axes[k])) warnings.push(`pair "${pid}": both items key "${k}" in the same polarity (should be opposite).`);
  }

  return { questions, errors, warnings };
}

// Length modes -> target question count. Deep = the whole bank.
export const MODE_SIZES = { quick: 100, normal: 250, deep: Infinity };
export function normalizeMode(mode) {
  if (mode === "quick" || mode === "normal" || mode === "deep") return mode;
  if (mode === "full") return "deep";          // legacy alias
  return "normal";                              // sensible default
}

function primaryAxisOf(q) {
  let best = null;
  for (const k of Object.keys(q.axes || {})) {
    if (isAxisKey(k) && (best === null || Math.abs(q.axes[k]) > Math.abs(q.axes[best]))) best = k;
  }
  return best;
}
// interleave three severity rungs, then id, so a prefix of the list spreads sev
function orderBySevThenId(arr) {
  const g = { 1: [], 2: [], 3: [] };
  for (const q of arr.slice().sort((a, b) => a.id - b.id)) g[[1, 2, 3].includes(q.sev) ? q.sev : 2].push(q);
  const out = []; let i = 0, any = true;
  while (any) { any = false; for (const s of [1, 2, 3]) { if (i < g[s].length) { out.push(g[s][i]); any = true; } } i++; }
  return out;
}
function zip(a, b) {
  const out = [], n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) { if (i < a.length) out.push(a[i]); if (i < b.length) out.push(b[i]); }
  return out;
}

// Deterministic, balanced subset of ~`target` questions: even coverage across all
// axes (round-robin), keying-balanced (+/- interleaved), severity-spread, always
// including attention checks, and keeping consistency pairs intact. Stable (no
// randomness) so every taker in a mode answers the same set.
//
// `target` counts NUMBERED (scored) questions only. Attention checks always ride
// along on top of it — they are not part of the numbered bank and are never shown
// with a question number, so counting them would silently shorten every mode.
export function selectQuestionSet(questions, target) {
  const isAttention = (q) => q.type === "attention";
  const numbered = questions.filter((q) => !isAttention(q));
  if (!Number.isFinite(target) || numbered.length <= target) return questions.slice();
  const chosen = new Set();

  // Anchor items fix where an axis's scale tops out, so every mode must serve
  // them. A short mode normalises over its own served set: drop the anchors and
  // the ceiling is reached by answering consistently rather than by holding the
  // extreme position — which is how an epistocrat outscored a monarchist on
  // Franchise. They are taken before the round-robin and count toward `target`.
  for (const q of numbered) if (q.anchor) chosen.add(q.id);

  // pair partner lookup (to keep pairs whole)
  const pairs = new Map();
  for (const q of questions) if (q.pair) { if (!pairs.has(q.pair)) pairs.set(q.pair, []); pairs.get(q.pair).push(q); }
  const partnerOf = new Map();
  for (const items of pairs.values()) if (items.length === 2) { partnerOf.set(items[0].id, items[1].id); partnerOf.set(items[1].id, items[0].id); }

  // per-primary-axis buckets, sign+sev interleaved
  const buckets = new Map();
  const perAxis = {};
  for (const q of numbered) {
    if (!q.axes) continue;
    const a = primaryAxisOf(q); if (!a) continue;
    (perAxis[a] = perAxis[a] || []).push(q);
  }
  for (const a of Object.keys(perAxis)) {
    // Anchors are already chosen, so they're kept out of the bucket rather than
    // skipped inside it — skipping would knock the +/- interleave out of step.
    // They all key one way, so lead the axis with the pole they under-represent;
    // otherwise a short mode ends up one-sided on exactly the axis they anchor.
    const items = perAxis[a].filter((q) => !chosen.has(q.id));
    const pos = orderBySevThenId(items.filter((q) => q.axes[a] > 0));
    const neg = orderBySevThenId(items.filter((q) => q.axes[a] < 0));
    let skew = 0;
    for (const q of perAxis[a]) if (chosen.has(q.id)) skew += q.axes[a] > 0 ? 1 : -1;
    buckets.set(a, skew > 0 ? zip(neg, pos) : zip(pos, neg));
  }

  const axes = AXIS_KEYS.filter((a) => buckets.has(a));
  const idx = Object.fromEntries(axes.map((a) => [a, 0]));
  let guard = 0;
  while (chosen.size < target && guard < questions.length * 2) {
    let progressed = false;
    for (const a of axes) {
      if (chosen.size >= target) break;
      const list = buckets.get(a);
      while (idx[a] < list.length && chosen.has(list[idx[a]].id)) idx[a]++;
      if (idx[a] < list.length) {
        const q = list[idx[a]++];
        chosen.add(q.id);
        const partner = partnerOf.get(q.id);
        if (partner !== undefined && !chosen.has(partner)) chosen.add(partner);
        progressed = true;
      }
    }
    if (!progressed) break;
    guard++;
  }
  return questions.filter((q) => isAttention(q) || chosen.has(q.id));
}

// The subset served for a given length mode.
export function questionsForMode(questions, mode) {
  const m = normalizeMode(mode);
  if (m === "deep") return questions.slice();
  return selectQuestionSet(questions, MODE_SIZES[m]);
}

// Stable 32-bit fingerprint of the whole bank (id + axes + type/expect/pair per
// item). Used to REFUSE resuming a session whose bank differs from the loaded one
// — ids can collide across bank versions while the underlying question changed,
// which would silently mis-score answers.
function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function bankSignature(questions) {
  const sorted = questions.slice().sort((a, b) => a.id - b.id);
  let s = "n=" + sorted.length + ";";
  for (const q of sorted) {
    const ax = Object.keys(q.axes || {}).sort().map((k) => k + ":" + q.axes[k]).join(",");
    s += q.id + "|" + ax + "|" + (q.type || "") + "|" + (q.expect == null ? "" : q.expect) + "|" + (q.pair || "") + ";";
  }
  return fnv1a(s);
}

// Per-item fingerprint — changes whenever an item's wording, keying or role does.
// A finished run stores these next to its answers so a later top-up can tell which
// stored answers still mean what they meant. Ids get REUSED across bank edits (398
// was an attention check and is now a real question), and merging an answer across
// such a change would silently score it against the wrong item.
export function itemFingerprint(q) {
  const ax = Object.keys(q.axes || {}).sort().map((k) => k + ":" + q.axes[k]).join(",");
  return fnv1a(`${q.id}|${q.text}|${ax}|${q.type || ""}|${q.expect == null ? "" : q.expect}`);
}
export function itemFingerprints(questions) {
  const out = {};
  for (const q of questions) out[q.id] = itemFingerprint(q);
  return out;
}

// Ids reused by the bank edit that added questions 398–400 and moved the attention
// checks to 901–903. Runs finished before that edit carry no fingerprints, so their
// answers to these three ids are attention-check responses and must be dropped;
// every other id (1–397) came through that edit unchanged and stays valid.
const PRE_FINGERPRINT_REUSED_IDS = [398, 399, 400];

// The subset of a finished run's answers that is still safe to merge into a new
// scoring pass. Anything whose item changed is dropped, so it comes back as a
// pending question and gets asked again rather than silently mis-scored.
export function reusableAnswers(run, questions) {
  const current = itemFingerprints(questions);
  const stored = run && run.itemFp;
  const out = {};
  for (const [k, v] of Object.entries((run && run.answers) || {})) {
    const id = Number(k);
    if (stored) { if (stored[id] !== undefined && stored[id] === current[id]) out[id] = v; }
    else if (!PRE_FINGERPRINT_REUSED_IDS.includes(id)) out[id] = v;
  }
  return out;
}

// Items that actually load axes (exclude attention checks).
function isScorable(q) { return q.type !== "attention" && q.axes && typeof q.axes === "object"; }

// Maximum attainable |raw| for one axis over a served set: Σ|weight| (|a|≤1).
export function maxAttainable(servedQuestions, axisKey) {
  let sum = 0;
  for (const q of servedQuestions) {
    if (!isScorable(q)) continue;
    const w = q.axes[axisKey];
    if (typeof w === "number") sum += Math.abs(w);
  }
  return sum;
}

// Number of scorable questions in the served set that load an axis.
export function itemCount(servedQuestions, axisKey) {
  let n = 0;
  for (const q of servedQuestions) {
    if (isScorable(q) && typeof q.axes[axisKey] === "number" && q.axes[axisKey] !== 0) n++;
  }
  return n;
}

const round1 = (x) => Math.round(x * 10) / 10;
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Compute normalized scores (answers are 0..100). Attention items are excluded.
// Returns { vector, raw, max, counts, answered }.
export function computeScores(answers, servedQuestions) {
  const get = answers instanceof Map ? (id) => answers.get(id) : (id) => answers[id];
  const raw = {}, answered = {};
  for (const k of AXIS_KEYS) { raw[k] = 0; answered[k] = 0; }

  for (const q of servedQuestions) {
    if (!isScorable(q)) continue;
    const s = get(q.id);
    if (s === undefined || s === null) continue;
    const a = (Number(s) - 50) / 50; // -1..+1
    if (!Number.isFinite(a)) continue;
    for (const k of Object.keys(q.axes)) {
      if (!isAxisKey(k)) continue;
      raw[k] += a * q.axes[k];
      answered[k]++;
    }
  }

  const vector = {}, max = {}, counts = {};
  for (const k of AXIS_KEYS) {
    const m = maxAttainable(servedQuestions, k);
    max[k] = m;
    counts[k] = itemCount(servedQuestions, k);
    vector[k] = m === 0 ? 0 : clamp(round1((raw[k] / m) * 100), -100, 100);
  }
  return { vector, raw, max, counts, answered };
}

// Numbered questions in the served set that a stored run has no answer for —
// i.e. what a returning taker must answer to bring an older run up to the current
// bank, instead of retaking it. Attention checks are deliberately excluded: they
// measure the session they were answered in, so the original verdict carries over
// rather than being re-tested by a handful of top-up items.
export function pendingQuestions(answers, servedQuestions) {
  const get = answers instanceof Map ? (id) => answers.get(id) : (id) => answers[id];
  return servedQuestions.filter((q) => {
    if (q.type === "attention") return false;
    const v = get(q.id);
    return v === undefined || v === null;
  });
}

// ---------------------------------------------------------------------------
// Attention checks
// ---------------------------------------------------------------------------
export function computeAttention(answers, questions) {
  const get = answers instanceof Map ? (id) => answers.get(id) : (id) => answers[id];
  const items = [];
  for (const q of questions) {
    if (q.type !== "attention") continue;
    const s = get(q.id);
    if (s === undefined || s === null) continue;
    const ok = Math.abs(Number(s) - q.expect) <= 15;
    items.push({ id: q.id, expect: q.expect, answer: Number(s), ok });
  }
  const failures = items.filter((x) => !x.ok).length;
  return { items, total: items.length, failures, failed: failures >= 2 };
}

// ---------------------------------------------------------------------------
// Consistency pairs: expected answer_a ≈ 100 - answer_b. Error = |a-(100-b)|.
// ---------------------------------------------------------------------------
export function computeConsistency(answers, questions) {
  const get = answers instanceof Map ? (id) => answers.get(id) : (id) => answers[id];
  const byPair = new Map();
  for (const q of questions) {
    if (typeof q.pair === "string" && q.pair && isScorable(q)) {
      if (!byPair.has(q.pair)) byPair.set(q.pair, []);
      byPair.get(q.pair).push(q);
    }
  }
  const pairs = [];
  const axisErrors = {}; // axisKey -> [errors]
  for (const [pid, items] of byPair) {
    if (items.length !== 2) continue;
    const [qa, qb] = items;
    const a = get(qa.id), b = get(qb.id);
    if (a === undefined || b === undefined || a === null || b === null) continue;
    const axis = Object.keys(qa.axes).find((k) => qb.axes[k] !== undefined) || Object.keys(qa.axes)[0];
    const error = Math.abs(Number(a) - (100 - Number(b)));
    pairs.push({ id: pid, axis, a: Number(a), b: Number(b), error });
    (axisErrors[axis] = axisErrors[axis] || []).push(error);
  }
  const perAxisError = {}, axisWarn = {};
  for (const k of Object.keys(axisErrors)) {
    const mean = axisErrors[k].reduce((s, e) => s + e, 0) / axisErrors[k].length;
    perAxisError[k] = round1(mean);
    axisWarn[k] = mean > 25;
  }
  const meanErr = pairs.length ? pairs.reduce((s, p) => s + p.error, 0) / pairs.length : 0;
  const overallPct = pairs.length ? Math.round(clamp(100 - meanErr, 0, 100)) : null;
  // A pair "fails" when the two answers are >40 points from mirroring. A high
  // fail RATE across many pairs signals answer↔question MISALIGNMENT (a bug),
  // not mere opinion — the results page uses this as a data-integrity canary.
  const failedPairs = pairs.filter((p) => p.error > 40).length;
  const failRate = pairs.length ? failedPairs / pairs.length : 0;
  return { pairs, perAxisError, axisWarn, overallPct, count: pairs.length, failedPairs, failRate };
}

// ---------------------------------------------------------------------------
// Bootstrap confidence bands (deterministic under a fixed seed).
// Per axis: resample its answered items with replacement `iters` times, recompute
// the normalized score, and return the 2.5th/97.5th percentiles. Bands that span
// zero mark an axis whose sign is not reliably determined.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapConfidence(answers, servedQuestions, opts = {}) {
  const iters = opts.iters || 200;
  const rnd = mulberry32((opts.seed >>> 0) || 0x1234567);
  const get = answers instanceof Map ? (id) => answers.get(id) : (id) => answers[id];

  // per-axis answered contributions + fixed denominator (served Σ|w|)
  const contribs = {}, denom = {};
  for (const k of AXIS_KEYS) { contribs[k] = []; denom[k] = maxAttainable(servedQuestions, k); }
  for (const q of servedQuestions) {
    if (!isScorable(q)) continue;
    const s = get(q.id);
    if (s === undefined || s === null) continue;
    const a = (Number(s) - 50) / 50;
    if (!Number.isFinite(a)) continue;
    for (const k of Object.keys(q.axes)) {
      if (isAxisKey(k)) contribs[k].push(a * q.axes[k]);
    }
  }

  const lo = {}, hi = {}, spansZero = {};
  for (const k of AXIS_KEYS) {
    const items = contribs[k], n = items.length, d = denom[k];
    if (n === 0 || d === 0) { lo[k] = 0; hi[k] = 0; spansZero[k] = true; continue; }
    const scores = new Array(iters);
    for (let it = 0; it < iters; it++) {
      let sum = 0;
      for (let j = 0; j < n; j++) sum += items[(rnd() * n) | 0];
      scores[it] = clamp((sum / d) * 100, -100, 100);
    }
    scores.sort((x, y) => x - y);
    lo[k] = round1(scores[Math.floor(0.025 * (iters - 1))]);
    hi[k] = round1(scores[Math.ceil(0.975 * (iters - 1))]);
    spansZero[k] = lo[k] <= 0 && hi[k] >= 0;
  }
  return { lo, hi, spansZero };
}

// The whole scored payload for one run. Shared by finishing a test and by merging
// a top-up into an earlier run, so the two paths can't compute a result differently.
export function scoreRun(answers, servedQuestions, opts = {}) {
  const scored = computeScores(answers, servedQuestions);
  const bands = bootstrapConfidence(answers, servedQuestions, { seed: opts.seed >>> 0, iters: opts.iters || 200 });
  return {
    vector: scored.vector,
    counts: scored.counts,
    attention: computeAttention(answers, servedQuestions),
    consistency: computeConsistency(answers, servedQuestions),
    bands,
    precision: precisionFromBands(bands, scored.counts),
  };
}

// ---------------------------------------------------------------------------
// Precision composite — "the shrinking dot". Repeated, sharper runs (slider >
// buttons, deeper > quicker) tighten a measured position via inverse-variance
// meta-analysis: a tighter bootstrap band (smaller σ) pulls the combined estimate
// harder. Each run persists per-axis { count, sigma }; sigma = half the 95% band.
// ---------------------------------------------------------------------------
export const SIGMA_FLOOR = 3.0;      // no single run may claim tighter than this
export const LEGACY_SIGMA = 25;      // a run saved before precision existed

// Per-axis { count, sigma } from a bootstrap band. sigma = (hi − lo)/2.
export function precisionFromBands(bands, counts) {
  const out = {};
  if (!bands || !bands.lo) return out;
  for (const k of AXIS_KEYS) {
    const lo = bands.lo[k], hi = bands.hi[k];
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    out[k] = { count: counts && counts[k] != null ? counts[k] : 0, sigma: round1(Math.abs(hi - lo) / 2) };
  }
  return out;
}

// Inverse-variance combine of several saved runs into one refined position + σ*.
// runs: [{ vector:{k:score}, precision?:{k:{count,sigma}}, created_at }]. A run with
// no `precision` block is legacy → σ=25 on every axis. Every σᵢ is floored at
// SIGMA_FLOOR before weighting so one lucky tight band can't dominate.
//
// DRIFT GUARD: you are not your past self. For each axis, if two runs disagree by
// more than (σᵢ+σⱼ) the person moved; only the latest "epoch" (the maximal set of
// most-recent runs with no pairwise violation) is averaged, and the axis is marked
// { drifted, from, to, since }. Returns { vector, sigma, perAxis, runsUsed }.
export function combineRuns(runs) {
  const ordered = (runs || []).filter((r) => r && r.vector).slice().sort((a, b) => {
    const ta = Date.parse(a.created_at || a.date || "") || 0;
    const tb = Date.parse(b.created_at || b.date || "") || 0;
    return ta - tb; // oldest → newest
  });
  const vector = {}, sigma = {}, perAxis = {};
  for (const k of AXIS_KEYS) {
    const obs = ordered.map((r) => {
      const p = r.precision && r.precision[k];
      const legacy = !r.precision;
      const sg = p && Number.isFinite(Number(p.sigma)) ? Math.max(SIGMA_FLOOR, Number(p.sigma)) : LEGACY_SIGMA;
      return { s: Number(r.vector[k]) || 0, sigma: sg, legacy, date: r.created_at || r.date || null };
    });
    // Build the latest epoch newest→oldest; stop at the first run that violates
    // |Δ| > (σᵢ+σⱼ) with ANY run already admitted (a drift boundary).
    const epoch = [];
    let boundary = null;
    for (let i = obs.length - 1; i >= 0; i--) {
      const c = obs[i];
      if (epoch.some((e) => Math.abs(c.s - e.s) > c.sigma + e.sigma)) { boundary = c; break; }
      epoch.push(c);
    }
    let wsum = 0, num = 0;
    for (const o of epoch) { const w = 1 / (o.sigma * o.sigma); wsum += w; num += o.s * w; }
    const score = wsum ? num / wsum : 0;
    const sg = wsum ? Math.sqrt(1 / wsum) : LEGACY_SIGMA;
    vector[k] = round1(score);
    sigma[k] = round1(sg);
    perAxis[k] = { score: vector[k], sigma: sigma[k], count: epoch.length, drifted: boundary != null, legacy: epoch.some((o) => o.legacy) };
    if (boundary) { perAxis[k].from = Math.round(boundary.s); perAxis[k].to = Math.round(score); perAxis[k].since = boundary.date; }
  }
  return { vector, sigma, perAxis, runsUsed: ordered.length };
}
