// archetypes.js — ideological archetypes and the salience-weighted matcher.
//
// Each archetype has a 22-dim `v` (vector, scores -100..100) and a 22-dim `s`
// (salience, 0..1, marking DEFINITIONAL axes). Similarity is a salience-weighted
// mean absolute difference, so an archetype is only "matched" when the axes that
// DEFINE it agree — not merely when unrelated axes happen to line up.
//
// This design exists to prevent one specific failure: conflating
// "distrust + restricted governance" with "distrust + popular sovereignty".
// Sharing distrust of institutions must NOT by itself produce a populist match.
//
// Axes are the 22-axis v2 set. Archetype specs below still use the four legacy
// fused keys (auth/dem/trust/meth) for brevity; the builder maps each to its
// PRIMARY split axis (auth->auth_pw, dem->dem_fr, trust->trust_pol,
// meth->meth_scope), leaving the sibling split axes (auth_pat, dem_tc, trust_sys,
// meth_means) at baseline salience so v1-bank users are matched consistently.
import { AXIS_KEYS, axisLabel, legacyToNew } from "./axes.js";

// Baseline salience applied to every axis an archetype does not explicitly mark.
// Small but nonzero so matching is genuinely full-vector, not partial-vector.
export const BASELINE_SALIENCE = 0.10;

// Build an archetype from a sparse spec: { key: [value, salience], ... }.
// Legacy fused keys are remapped to their primary split axis.
function A(name, spec) {
  const v = {}, s = {};
  for (const k of AXIS_KEYS) { v[k] = 0; s[k] = BASELINE_SALIENCE; }
  for (const k of Object.keys(spec)) {
    const nk = legacyToNew(k);
    const [val, sal] = spec[k];
    v[nk] = val;
    s[nk] = sal;
  }
  return { name, v, s };
}

export const ARCHETYPES = [
  A("Progressive", {
    soc: [-85, 0.95], rel: [-70, 0.7], wel: [-70, 0.85], env: [-70, 0.8],
    imm: [-50, 0.5], mkt: [-40, 0.5], jus: [-60, 0.6], spe: [30, 0.4],
    meth: [40, 0.4], natl: [-50, 0.5], auth: [-20, 0.3],
  }),
  A("Social Democrat", {
    mkt: [-60, 0.85], wel: [-75, 0.9], trd: [-20, 0.3], soc: [-40, 0.4],
    env: [-50, 0.5], jus: [-40, 0.4], dem: [-30, 0.4], trust: [40, 0.4], meth: [-10, 0.3],
  }),
  A("Democratic Socialist", {
    mkt: [-85, 0.9], wel: [-85, 0.85], trd: [-20, 0.3], soc: [-50, 0.5],
    env: [-60, 0.5], meth: [50, 0.6], dem: [-40, 0.5], auth: [-20, 0.3], natl: [-40, 0.4],
  }),
  A("Revolutionary Socialist", {
    mkt: [-95, 0.9], wel: [-80, 0.6], meth: [95, 0.9], auth: [40, 0.5],
    dem: [20, 0.4], trust: [-70, 0.6], soc: [-50, 0.4], fed: [40, 0.3],
  }),
  A("Liberal (US)", {
    soc: [-55, 0.7], wel: [-45, 0.6], mkt: [-20, 0.4], env: [-45, 0.5],
    imm: [-40, 0.5], jus: [-35, 0.4], rel: [-45, 0.5], spe: [20, 0.3],
    trust: [40, 0.4], natl: [-35, 0.4],
  }),
  A("Neoliberal", {
    mkt: [80, 0.9], wel: [50, 0.6], trd: [-70, 0.8], tech: [50, 0.5],
    env: [40, 0.4], natl: [-40, 0.5], fp: [30, 0.4], trust: [40, 0.4],
  }),
  A("Libertarian", {
    mkt: [90, 0.9], wel: [80, 0.7], auth: [-90, 0.95], sec: [-80, 0.8],
    spe: [-80, 0.8], jus: [-20, 0.3], imm: [-20, 0.3], fp: [-60, 0.5],
    rel: [-30, 0.3], dem: [-30, 0.3], tech: [50, 0.4], env: [40, 0.4],
  }),
  A("Paleolibertarian", {
    mkt: [90, 0.85], wel: [80, 0.6], auth: [-80, 0.85], sec: [-70, 0.6],
    spe: [-80, 0.6], soc: [50, 0.6], rel: [30, 0.4], imm: [50, 0.5],
    natl: [40, 0.5], fp: [-80, 0.7], fed: [-60, 0.5],
  }),
  A("Anarcho-Capitalist", {
    mkt: [100, 0.95], wel: [95, 0.8], auth: [-100, 0.95], sec: [-90, 0.7],
    spe: [-90, 0.6], dem: [-60, 0.5], fed: [-90, 0.6], fp: [-90, 0.6],
    jus: [-30, 0.3], trust: [-80, 0.6],
  }),
  A("Conservative (US)", {
    mkt: [60, 0.7], wel: [55, 0.6], soc: [65, 0.85], rel: [55, 0.7],
    auth: [30, 0.4], jus: [60, 0.6], imm: [55, 0.6], natl: [55, 0.6],
    fp: [50, 0.5], sec: [40, 0.4], env: [50, 0.4], fed: [-30, 0.4], meth: [-40, 0.4],
  }),
  A("Paleoconservative", {
    soc: [85, 0.85], rel: [65, 0.6], natl: [75, 0.8], imm: [80, 0.8],
    trd: [70, 0.7], fp: [-70, 0.8], mkt: [40, 0.4], fed: [-60, 0.5],
    auth: [30, 0.4], meth: [-40, 0.4],
  }),
  A("Neoconservative", {
    fp: [95, 0.95], natl: [55, 0.6], mkt: [60, 0.6], wel: [55, 0.5],
    soc: [55, 0.5], rel: [45, 0.4], sec: [70, 0.7], auth: [40, 0.5],
    imm: [40, 0.4], meth: [20, 0.3],
  }),
  A("Religious Traditionalist", {
    rel: [95, 0.95], soc: [90, 0.9], jus: [60, 0.5], auth: [50, 0.5],
    spe: [50, 0.5], imm: [40, 0.4], natl: [40, 0.4], meth: [-50, 0.4], env: [40, 0.3],
  }),
  A("Christian Democrat", {
    rel: [60, 0.8], soc: [45, 0.5], wel: [-40, 0.6], mkt: [-10, 0.3],
    trd: [-20, 0.3], natl: [20, 0.3], imm: [20, 0.3], fp: [20, 0.3],
    meth: [-50, 0.5], trust: [50, 0.5], dem: [-20, 0.3],
  }),
  A("Corporatist", {
    mkt: [-30, 0.5], wel: [-50, 0.5], auth: [60, 0.7], natl: [60, 0.7],
    soc: [50, 0.5], dem: [50, 0.6], trust: [40, 0.4], fed: [50, 0.4],
    meth: [-20, 0.3], spe: [40, 0.4],
  }),
  A("Monarchist", {
    dem: [85, 0.9], auth: [70, 0.7], soc: [75, 0.7], rel: [60, 0.5],
    trust: [50, 0.4], meth: [-60, 0.6], fed: [40, 0.4], natl: [40, 0.4],
  }),
  A("Reactionary", {
    soc: [95, 0.9], rel: [70, 0.6], dem: [70, 0.7], auth: [70, 0.6],
    meth: [50, 0.6], jus: [70, 0.5], natl: [60, 0.5], imm: [70, 0.5],
  }),
  // Populists: nationalism/economics + POPULAR-SOVEREIGNTY are the definitional
  // axes. Distrust of institutions is common but NOT sufficient (low salience),
  // so "distrust + restricted governance" can never read as populism.
  A("National Populist", {
    natl: [92, 1.0], imm: [86, 1.0], dem: [-72, 1.0], trd: [65, 0.5],
    soc: [55, 0.35], trust: [-70, 0.2],
  }),
  A("Left-Populist", {
    mkt: [-80, 1.0], wel: [-80, 1.0], dem: [-85, 1.0], meth: [55, 0.4],
    env: [-48, 0.35], trust: [-72, 0.2],
  }),
  A("Technocrat", {
    dem: [75, 0.85], trust: [80, 0.85], tech: [80, 0.8], meth: [-20, 0.3],
    mkt: [20, 0.3], env: [20, 0.3], soc: [-20, 0.3], sec: [40, 0.4], auth: [40, 0.4],
  }),
  A("Centrist", {
    meth: [-50, 0.6], trust: [40, 0.5], soc: [0, 0.3], mkt: [0, 0.3],
    dem: [-10, 0.3], auth: [0, 0.3],
  }),
  A("Communitarian", {
    soc: [40, 0.6], wel: [-50, 0.6], auth: [30, 0.5], natl: [30, 0.4],
    rel: [30, 0.4], spe: [40, 0.5], mkt: [-30, 0.4], dem: [20, 0.3],
    env: [-30, 0.3], imm: [20, 0.3], meth: [-30, 0.3],
  }),
  A("Isolationist Nationalist", {
    fp: [-95, 0.95], natl: [80, 0.8], imm: [75, 0.7], trd: [75, 0.7],
    sec: [40, 0.4], mkt: [30, 0.3], soc: [50, 0.4], trust: [-20, 0.3],
  }),
  A("Authoritarian Statist", {
    auth: [95, 0.95], sec: [90, 0.85], dem: [80, 0.85], spe: [80, 0.7],
    jus: [80, 0.6], fed: [70, 0.5], trust: [40, 0.4], natl: [50, 0.4], meth: [0, 0.2],
  }),
  A("Green", {
    env: [-95, 0.95], tech: [-40, 0.5], mkt: [-50, 0.6], wel: [-55, 0.6],
    soc: [-60, 0.6], meth: [40, 0.4], natl: [-50, 0.4], fp: [-50, 0.4],
    imm: [-30, 0.3], dem: [-30, 0.3],
  }),
  A("Civil-Libertarian", {
    auth: [-90, 0.9], sec: [-90, 0.9], spe: [-90, 0.9], jus: [-60, 0.6],
    dem: [-50, 0.5], rel: [-40, 0.4], imm: [-30, 0.3], fp: [-40, 0.4],
    mkt: [0, 0.2], wel: [0, 0.2],
  }),
  A("Developmentalist", {
    env: [80, 0.85], tech: [80, 0.8], mkt: [-30, 0.5], auth: [40, 0.5],
    dem: [40, 0.4], natl: [50, 0.5], fp: [10, 0.3], trd: [40, 0.4], meth: [30, 0.3],
  }),
  A("Anarchist", {
    auth: [-100, 0.95], dem: [-80, 0.85], trust: [-90, 0.85], sec: [-80, 0.6],
    spe: [-80, 0.6], mkt: [-40, 0.4], wel: [-30, 0.3], fed: [-80, 0.6],
    meth: [80, 0.6], natl: [-60, 0.5], fp: [-70, 0.5],
  }),
];

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

// Salience-weighted ROOT-MEAN-SQUARE distance -> similarity %. RMS (vs plain mean
// abs) makes a few large single-axis disagreements cost proportionally more, so a
// profile with strong outlier positions can't be diluted into a bland match by
// many near-zero agreements.
export function similarity(userVec, arch) {
  let wsum = 0, dsum = 0;
  for (const k of AXIS_KEYS) {
    const s = arch.s[k];
    const d = (userVec[k] || 0) - arch.v[k];
    dsum += s * d * d;
    wsum += s;
  }
  const rms = wsum ? Math.sqrt(dsum / wsum) : 0; // 0..200
  return 100 * (1 - rms / 200);
}

// The largest disagreement on a DEFINITIONAL axis (salience >= 0.5).
function maxDefiningDiff(userVec, arch) {
  let m = 0;
  for (const k of AXIS_KEYS) {
    if (arch.s[k] >= 0.5) m = Math.max(m, Math.abs((userVec[k] || 0) - arch.v[k]));
  }
  return m;
}

// Tier from similarity, with a guard: a "Strong" match is capped to "Moderate"
// if the profile differs by >40 points on any axis the archetype strongly defines
// (salience >= 0.5) — you can't be a "Strong" X while contradicting a core X axis.
export function tierFor(sim, userVec, arch) {
  if (sim >= 85) {
    if (userVec && arch && maxDefiningDiff(userVec, arch) > 40) return "Moderate";
    return "Strong";
  }
  if (sim >= 70) return "Moderate";
  if (sim >= 55) return "Weak";
  return "None";
}

// The three largest RAW per-axis differences — what the user visibly differs on,
// not salience-filtered.
export function topDisagreements(userVec, arch, n = 3) {
  return AXIS_KEYS
    .map((k) => ({ key: k, label: axisLabel(k), diff: Math.abs((userVec[k] || 0) - arch.v[k]) }))
    .filter((x) => x.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, n);
}

// Full-vector matcher (the default, and the only correct one). Returns every
// archetype sorted by similarity, each with tier and its top disagreements.
export function matchArchetypes(userVec) {
  return ARCHETYPES
    .map((arch) => {
      const sim = similarity(userVec, arch);
      return {
        name: arch.name,
        similarity: sim,
        tier: tierFor(sim, userVec, arch),
        disagreements: topDisagreements(userVec, arch),
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

// Single-axis positions — EXPLICITLY not an ideology match. Returns every
// archetype's POSITION on one axis plus its distance from the user, sorted by
// absolute distance. No percentage (which is what produced meaningless ties):
// the caller renders a number line + a distance-sorted list.
export function singleAxisMatch(userVec, axisKey) {
  const u = userVec[axisKey] || 0;
  return ARCHETYPES
    .map((arch) => ({
      name: arch.name,
      axisScore: arch.v[axisKey],
      salience: arch.s[axisKey],
      distance: Math.abs(u - arch.v[axisKey]),
    }))
    .sort((a, b) => a.distance - b.distance || b.salience - a.salience);
}
