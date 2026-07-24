// certify.js — the self-certification loop (the Daily Brief's differentiator).
// Every drafted item is scored by the EXISTING analyzer pipeline; it may publish
// only if the analyzer detected NO stance and raised NO flags. On failure, one
// rewrite is attempted with the failing framing fed back; a second failure parks
// the item for human editing. The loop is injected with certify/rewrite callbacks
// so it runs identically in production and under the audit's stubs.

// Neutral = the whole point: no detected stance and no flags of any kind.
function isNeutral(a) {
  return !!a && a.stance_detected === false && !a.flagged && (!a.flags || a.flags.length === 0);
}

// The scored axes that made an item fail — fed back into the rewrite prompt so it
// knows exactly which framing to strip ("you scored imm +34 on this quote").
function failingAxes(a) {
  if (!a || !a.axes) return [];
  return Object.keys(a.axes).map((k) => ({ axis: k, score: a.axes[k].score, evidence: a.axes[k].evidence || "" }));
}

// Certify one item with up to `maxRewrites` rewrite attempts.
//   certify(item)          -> analysis { id, stance_detected, flags, flagged, axes }
//   rewrite(item, analysis)-> a new item (framing removed)
// Returns { item, analysisId, certOk, attempts, needsHuman }.
async function certifyItem(item, { certify, rewrite, maxRewrites = 1 }) {
  let cur = item, analysis = null;
  for (let attempt = 0; attempt <= maxRewrites; attempt++) {
    analysis = await certify(cur);
    if (isNeutral(analysis)) {
      return { item: cur, analysisId: analysis.id, certOk: true, attempts: attempt, needsHuman: false };
    }
    if (attempt < maxRewrites) cur = await rewrite(cur, analysis);
  }
  return { item: cur, analysisId: analysis && analysis.id, certOk: false, attempts: maxRewrites, needsHuman: true };
}

module.exports = { isNeutral, failingAxes, certifyItem };
