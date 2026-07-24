// precision.js — the precision composite ("the shrinking dot"). Kept apart from the
// single-run scoring in scoring.js: this is meta-analysis ACROSS saved runs, not the
// scoring of one run. Repeated, sharper runs (Precision > Classic, Deep > Quick)
// tighten a measured position via inverse-variance weighting — a tighter bootstrap
// band (smaller σ) pulls the combined estimate harder.
import { AXIS_KEYS } from "./axes.js";

const round1 = (x) => Math.round(x * 10) / 10;

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
