// validate.js — sanity checks on the model's JSON output against the article.
// A flagged analysis still renders (with a caution badge) but is EXCLUDED from
// writer/source aggregates. Triggers, per spec:
//   (a) an evidence quote that is not a verbatim substring of the article
//       (after whitespace normalization),
//   (b) more than 8 scored axes,
//   (c) any score exactly +100 or -100,
//   (d) invalid JSON after the repair retry (handled by the caller).
// The model's own "injection_attempt" flag additionally renders a visible notice.

const GENRES = new Set(["report", "analysis", "opinion", "mixed"]);
const MODEL_FLAGS = new Set(["injection_attempt", "paywalled_fragment", "non_political", "satire_suspected"]);
const MAX_AXES = 8;
const MAX_EVIDENCE_WORDS = 25;

// Whitespace-normalize and unify common lossy transforms (curly/straight quotes,
// dash variants) so a faithfully-quoted passage still matches when the page used
// a typographic character the model rendered differently. Case is preserved.
function normForMatch(s) {
  return String(s || "")
    .normalize("NFKC")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—‑−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
function wordCount(s) { const t = String(s || "").trim(); return t ? t.split(/\s+/).length : 0; }

// parsed: the object parsed from the model JSON. articleText: the sent article.
// axisKeys: valid axis keys (from js/axes.js). Returns a cleaned, validated
// analysis plus flag metadata.
function validateAnalysis(parsed, articleText, axisKeys) {
  const reasons = [];
  const keySet = new Set(axisKeys);
  const normArticle = normForMatch(articleText);

  const genre = GENRES.has(parsed && parsed.genre) ? parsed.genre : "report";
  const stanceDetected = !!(parsed && parsed.stance_detected);
  const summary = typeof (parsed && parsed.summary) === "string" ? parsed.summary.slice(0, 400) : "";

  // Model-supplied flags, filtered to the known set.
  const modelFlags = Array.isArray(parsed && parsed.flags)
    ? parsed.flags.filter((f) => MODEL_FLAGS.has(f))
    : [];
  const injection = modelFlags.includes("injection_attempt");

  // Clean the axes.
  const axes = {};
  const inAxes = parsed && typeof parsed.axes === "object" && parsed.axes ? parsed.axes : {};
  for (const key of Object.keys(inAxes)) {
    if (!keySet.has(key)) continue; // ignore unknown axis keys
    const a = inAxes[key];
    if (!a || typeof a !== "object") continue;
    let score = Math.round(Number(a.score));
    if (!Number.isFinite(score)) continue;
    if (score < -100) score = -100;
    if (score > 100) score = 100;
    let confidence = Number(a.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(1, confidence));
    const evidence = typeof a.evidence === "string" ? a.evidence.trim() : "";

    const axis = { score, confidence, evidence };

    // (c) exact ±100 is disallowed by the rubric.
    if (score === 100 || score === -100) { axis.evidenceOk = undefined; reasons.push(`axis ${key} scored exactly ${score}`); axis.extreme = true; }

    // Evidence verification.
    const normEv = normForMatch(evidence);
    const words = wordCount(evidence);
    const substringOk = normEv.length > 0 && normArticle.includes(normEv);
    if (!substringOk) { axis.evidenceOk = false; reasons.push(`axis ${key} evidence not found verbatim in article`); }
    else if (words > MAX_EVIDENCE_WORDS) { axis.evidenceOk = false; reasons.push(`axis ${key} evidence exceeds ${MAX_EVIDENCE_WORDS} words`); }
    else axis.evidenceOk = true;

    axes[key] = axis;
  }

  const axisCount = Object.keys(axes).length;
  if (axisCount > MAX_AXES) reasons.push(`${axisCount} axes scored (max ${MAX_AXES})`);

  const flags = modelFlags.slice();
  if (reasons.some((r) => /evidence/.test(r))) if (!flags.includes("evidence_mismatch")) flags.push("evidence_mismatch");

  const flagged = reasons.length > 0 || injection;

  return {
    ok: true,
    analysis: { genre, stance_detected: stanceDetected, axes, summary, flags },
    flagged,
    injection,
    reasons,
    axisCount,
  };
}

module.exports = { validateAnalysis, normForMatch, wordCount, GENRES, MODEL_FLAGS };
