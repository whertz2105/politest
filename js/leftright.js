// leftright.js — SINGLE SOURCE OF TRUTH for the traditional American left↔right
// composite. Pure data + one function, no DOM or other imports, so it can be used
// by the frontend (import) AND the backend (server.js imports it and hands the
// function to the analyzer store for the recent-list mini bars).
//
// Signed methodology weight per axis: + = the axis's POSITIVE pole is US-right-
// coded, − = the positive pole is US-left-coded; magnitude = how load-bearing the
// axis is for partisan placement. Axes with no clean partisan coding are omitted
// (weight 0) and do not move the needle.
export const LR_WEIGHTS = {
  mkt: 1, wel: 1, soc: 1, imm: 1, env: 0.9, rel: 0.8, jus: 0.8, natl: 0.8,
  dem_fr: 0.6, sec: 0.5, fp: 0.3,   // right-coded positive pole
  spe: -0.7, fed: -0.6,             // left-coded positive pole
};

// axesMap: { key: { score, confidence? } }. Returns { x: −100..+100 (+ = right), hasSignal }.
export function leftRightScore(axesMap) {
  let num = 0, den = 0;
  for (const k in axesMap) {
    const w = LR_WEIGHTS[k]; if (!w) continue;
    const s = Number(axesMap[k].score); if (!Number.isFinite(s)) continue;
    const c = axesMap[k].confidence == null ? 1 : Math.max(0, Math.min(1, Number(axesMap[k].confidence)));
    num += s * Math.sign(w) * Math.abs(w) * c;
    den += Math.abs(w) * 100 * c;
  }
  const x = den ? Math.max(-100, Math.min(100, Math.round((num / den) * 100))) : 0;
  return { x, hasSignal: den > 0 };
}

export function lrLabel(x) {
  const a = Math.abs(x), side = x < 0 ? "left" : "right", Side = x < 0 ? "Left" : "Right";
  if (a < 8) return "Centrist";
  if (a < 25) return `Center-${side}`;
  if (a < 50) return `${Side}-leaning`;
  return `Strongly ${side}`;
}
