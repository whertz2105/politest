// archetypes.js — ideological archetypes and the salience-weighted matcher.
// Data is INSTALLED from data/archetypes.json (28 entries, full 22-axis vector +
// salience) via js/archetypes-data.js. The matcher exists to prevent one failure:
// conflating "distrust + restricted governance" with "distrust + popular
// sovereignty" — sharing distrust must NOT by itself yield a populist match.
import { AXIS_KEYS, axisLabel } from "./axes.js";
import { ARCHETYPE_DATA } from "./archetypes-data.js";

// Retained for compatibility; the installed data provides full 22-axis salience.
export const BASELINE_SALIENCE = 0.10;

export const ARCHETYPES = ARCHETYPE_DATA.map((e) => {
  const v = {}, s = {};
  for (const k of AXIS_KEYS) {
    v[k] = Number.isFinite(e.vector[k]) ? e.vector[k] : 0;
    s[k] = Number.isFinite(e.salience[k]) ? e.salience[k] : BASELINE_SALIENCE;
  }
  return { name: e.name, v, s };
});

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
