// figures.js — historical-figure reference points for the comparison graph.
// Vectors are the SAME 22-axis space as the user's result. Missing axes default 0.
// The dataset (data/figures.json) is authored/edited by the site owner; treat it as
// untrusted and validate like questions.json.
import { AXIS_KEYS, isAxisKey } from "./axes.js";

export function normalizeVector(partial) {
  const v = {};
  for (const k of AXIS_KEYS) {
    const n = Number(partial[k]);
    v[k] = Number.isFinite(n) ? clamp(Math.round(n), -100, 100) : 0;
  }
  return v;
}

// Returns { figures:[{name, v, note}], errors:[] }.
export function validateFigures(raw) {
  const errors = [];
  const figures = [];
  if (!Array.isArray(raw)) return { figures, errors: ["figures.json is not a JSON array."] };
  const seen = new Set();
  raw.forEach((f, i) => {
    const where = `figure ${i}` + (f && f.name ? ` (${f.name})` : "");
    if (typeof f !== "object" || f === null) { errors.push(`${where}: not an object.`); return; }
    if (typeof f.name !== "string" || !f.name.trim()) { errors.push(`${where}: missing "name".`); return; }
    if (seen.has(f.name)) { errors.push(`${where}: duplicate name.`); return; }
    seen.add(f.name);
    if (typeof f.vector !== "object" || f.vector === null) { errors.push(`${where}: missing "vector".`); return; }
    for (const k of Object.keys(f.vector)) {
      if (!isAxisKey(k)) errors.push(`${where}: unknown axis "${k}".`);
      else {
        const w = Number(f.vector[k]);
        if (!Number.isFinite(w) || w < -100 || w > 100) errors.push(`${where}: axis "${k}" = ${f.vector[k]} out of range (-100..100).`);
      }
    }
    const note = typeof f.blurb === "string" ? f.blurb : (typeof f.note === "string" ? f.note : "");
    figures.push({ name: f.name, v: normalizeVector(f.vector), note, era: typeof f.era === "string" ? f.era : "", placeholder: !!f.placeholder });
  });
  return { figures, errors };
}

// Plain (unweighted) similarity over all 22 axes: 1 - meanAbsDiff/200, as %.
export function figureProximity(userVec, figureV) {
  let sum = 0;
  for (const k of AXIS_KEYS) sum += Math.abs((userVec[k] || 0) - (figureV[k] || 0));
  return 100 * (1 - (sum / AXIS_KEYS.length) / 200);
}

export function nearestFigures(userVec, figures, n = 5) {
  return figures
    .map((f) => ({ name: f.name, note: f.note, era: f.era, proximity: figureProximity(userVec, f.v) }))
    .sort((a, b) => b.proximity - a.proximity)
    .slice(0, n);
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
