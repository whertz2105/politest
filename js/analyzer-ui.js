// analyzer-ui.js — shared rendering for the Analyzer pages (analyze / article /
// profile). Reuses the app's chart components (renderBarReadout, wireQuadrant)
// and axis metadata. Every analysis view carries the standing disclaimer.

import { AXES, AXIS_KEYS, axisByKey } from "./axes.js";
import { escapeHtml } from "./app.js";
import { renderBarReadout, wireQuadrant } from "./charts2d.js";

export const DISCLAIMER =
  `<p class="disclaimer">Automated analysis by a language model against a
   <a href="data.html#rubric">published rubric</a>. Every score cites evidence from
   the text. It is a starting point, not a verdict.</p>`;

const GENRE_LABEL = { report: "Report", analysis: "Analysis", opinion: "Opinion", mixed: "Mixed" };

function sign(n) { return (n > 0 ? "+" : "") + n; }
function pctX(v) { return Math.max(0, Math.min(100, (v + 100) / 2)); }

// ---- Traditional American left–right composite ---------------------------
// Signed methodology weight per axis: + = the axis's POSITIVE pole is US-right-
// coded, − = the positive pole is US-left-coded; magnitude = how load-bearing the
// axis is for partisan placement. Axes with no clean partisan coding are omitted
// (weight 0) and do not move the needle: trd, auth_pat, auth_pw, dem_tc,
// trust_pol, trust_sys, meth_scope, meth_means, tech.
const LR_WEIGHTS = {
  mkt: 1, wel: 1, soc: 1, imm: 1, env: 0.9, rel: 0.8, jus: 0.8, natl: 0.8,
  dem_fr: 0.6, sec: 0.5, fp: 0.3,   // right-coded positive pole
  spe: -0.7, fed: -0.6,             // left-coded positive pole (regulated speech; federal centralization)
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

function lrLabel(x) {
  const a = Math.abs(x), side = x < 0 ? "left" : "right", Side = x < 0 ? "Left" : "Right";
  if (a < 8) return "Centrist";
  if (a < 25) return `Center-${side}`;
  if (a < 50) return `${Side}-leaning`;
  return `Strongly ${side}`;
}

// A left↔right barline shown on every analysis, even with no detected lean.
export function renderLeftRightBar(axesMap) {
  const { x, hasSignal } = leftRightScore(axesMap);
  const pos = (x + 100) / 2;
  const label = hasSignal ? lrLabel(x) : "Centrist";
  const caption = hasSignal
    ? `<strong>${label}</strong> · <span class="lr-num">${sign(x)}</span> on the left–right scale`
    : `<strong>Centrist</strong> · no partisan lean detected on the measured dimensions`;
  return `<figure class="lr">
    <figcaption class="lr-caption">${caption}</figcaption>
    <div class="lr-track"><span class="lr-marker" style="left:${pos}%" title="${sign(x)}"></span></div>
    <div class="lr-scale"><span>Left · progressive</span><span>Center</span><span>Right · conservative</span></div>
  </figure>`;
}

// One scored axis, evidence-forward. `a` = {score, confidence, evidence, evidenceOk?, extreme?}.
function axisRow(key, a) {
  const meta = axisByKey(key);
  if (!meta) return "";
  const dir = a.score >= 0 ? "pos" : "neg";
  const pole = a.score >= 0 ? meta.posLabel : meta.negLabel;
  const from = Math.min(50, pctX(a.score));
  const width = Math.abs(pctX(a.score) - 50);
  const conf = Math.round((Number(a.confidence) || 0) * 100);
  const warnEv = a.evidenceOk === false ? `<span class="tag warn" title="evidence not verified against the text">⚠ unverified quote</span>` : "";
  const warnEx = a.extreme ? `<span class="tag warn" title="score at the ±100 extreme the rubric forbids">⚠ extreme</span>` : "";
  return `<div class="axrow">
    <div class="axrow-head">
      <span class="axrow-name">${escapeHtml(meta.label)}</span>
      <span class="axrow-pole ${dir}">${escapeHtml(pole)}</span>
      ${warnEv}${warnEx}
      <span class="axrow-score ${dir}">${sign(a.score)}</span>
      <span class="axrow-conf muted" title="model confidence in the stance reading">conf ${conf}%</span>
    </div>
    <div class="bar-track" role="img" aria-label="${escapeHtml(meta.label)}: ${a.score}">
      <span class="pole neg">${escapeHtml(meta.negLabel)}</span>
      <svg class="bar-svg" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
        <line x1="50" y1="0" x2="50" y2="12" class="bar-mid"/>
        <rect x="${from}" y="3.5" width="${width}" height="5" rx="1" class="bar-fill ${dir}"/>
      </svg>
      <span class="pole pos">${escapeHtml(meta.posLabel)}</span>
    </div>
    ${a.evidence ? `<blockquote class="axrow-ev">“${escapeHtml(a.evidence)}”</blockquote>` : ""}
  </div>`;
}

function flagBanner(rec) {
  const parts = [];
  if (rec.injection || (rec.flags || []).includes("injection_attempt")) {
    parts.push(`<div class="notice notice-alert"><strong>Prompt-injection attempt detected.</strong>
      The submitted text contained instructions aimed at the analyzer. They were ignored and treated as content; this analysis is excluded from aggregates.</div>`);
  }
  if (rec.flagged && !rec.injection) {
    parts.push(`<div class="notice notice-warn"><strong>Flagged for review.</strong>
      One or more sanity checks did not pass (unverified quote, too many axes, or an extreme score). Shown for transparency but excluded from writer/source aggregates.</div>`);
  }
  for (const f of rec.flags || []) {
    if (f === "paywalled_fragment") parts.push(`<div class="notice">Only a paywalled fragment was available; the reading may be partial.</div>`);
    if (f === "non_political") parts.push(`<div class="notice">The model judged this piece non-political.</div>`);
    if (f === "satire_suspected") parts.push(`<div class="notice">Satire suspected — stance may be ironic.</div>`);
  }
  return parts.join("");
}

// Render a single article analysis into `el`.
export function renderArticle(el, rec) {
  const keys = Object.keys(rec.axes || {}).sort((a, b) => Math.abs(rec.axes[b].score) - Math.abs(rec.axes[a].score));
  const writerLink = rec.writerKey ? `<a href="profile.html#writer=${encodeURIComponent(rec.writerKey)}">${escapeHtml(rec.writer || "writer")}</a>` : (rec.writer ? escapeHtml(rec.writer) : "unknown");
  const sourceLink = rec.source ? `<a href="profile.html#source=${encodeURIComponent(rec.source)}">${escapeHtml(rec.source)}</a>` : "unknown";
  const urlLine = rec.url ? `<a class="src-url" href="${escapeHtml(rec.url)}" rel="nofollow noopener" target="_blank">${escapeHtml(rec.url)}</a>` : `<span class="muted">pasted text</span>`;

  let html = `
    <div class="analysis-head">
      <span class="genre-chip genre-${rec.genre}">${GENRE_LABEL[rec.genre] || rec.genre}</span>
      ${rec.flagged ? `<span class="genre-chip caution">caution</span>` : ""}
      <h1>${escapeHtml(rec.title || "Untitled article")}</h1>
      <p class="analysis-meta">By ${writerLink} · ${sourceLink} · ${urlLine}</p>
      <p class="analysis-summary">${escapeHtml(rec.summary || "")}</p>
    </div>
    ${flagBanner(rec)}
    ${DISCLAIMER}
    ${renderLeftRightBar(rec.axes || {})}`;

  if (!rec.stance_detected || keys.length === 0) {
    html += `<div class="notice notice-ok"><strong>No detectable stance.</strong>
      This piece read as straight reporting: no axis met the evidence bar. That is a valid and common result.</div>`;
    el.innerHTML = html;
    return;
  }

  html += `<div class="ax-list">${keys.map((k) => axisRow(k, rec.axes[k])).join("")}</div>`;
  // A quadrant of the two strongest axes, using the shared chart component.
  if (keys.length >= 2) {
    html += `<figure class="quad-figure" data-quad></figure>`;
  }
  html += `<p class="rubric-stamp muted">Scored against rubric ${escapeHtml(rec.rubric ? rec.rubric.version : "?")} ·
     model ${escapeHtml(rec.rubric ? (rec.rubric.model || "?") : "?")} · hash ${escapeHtml(rec.rubric ? String(rec.rubric.sha256).slice(0, 12) : "?")}</p>`;
  el.innerHTML = html;

  if (keys.length >= 2) {
    const vec = {};
    for (const k of AXIS_KEYS) vec[k] = rec.axes[k] ? rec.axes[k].score : 0;
    wireQuadrant(el.querySelector("[data-quad]"), vec, keys[0], keys[1], { title: "Two strongest axes" });
  }
}

// Render a writer/source aggregate profile into `el`.
export function renderProfile(el, prof) {
  const isWriter = prof.kind === "writer";
  const title = isWriter ? (prof.name || "Unknown writer") : prof.domain;
  const sub = isWriter && prof.domain ? ` · <a href="profile.html#source=${encodeURIComponent(prof.domain)}">${escapeHtml(prof.domain)}</a>` : "";
  const min = prof.minArticles || 3;

  // Build the aggregate vector + counts; axes below the threshold render "awaiting".
  const vec = {}, counts = {};
  for (const k of AXIS_KEYS) {
    const a = prof.axes[k];
    if (a && a.n >= min) { vec[k] = a.mean; counts[k] = a.n; }
    else { vec[k] = 0; counts[k] = 0; }
  }
  const anyAxes = Object.values(prof.axes).some((a) => a.n >= min);

  // Left–right composite from the aggregate means (axes at/above the threshold).
  const lrMap = {};
  for (const k of AXIS_KEYS) { const a = prof.axes[k]; if (a && a.n >= min) lrMap[k] = { score: a.mean, confidence: 1 }; }

  el.innerHTML = `
    <div class="analysis-head">
      <span class="genre-chip">${isWriter ? "Writer" : "Source"}</span>
      <h1>${escapeHtml(title)}${sub}</h1>
      <p class="analysis-meta">${prof.articleCount} analyzed article${prof.articleCount === 1 ? "" : "s"} ·
        axes aggregate at ${min}+ articles</p>
    </div>
    ${DISCLAIMER}
    ${renderLeftRightBar(lrMap)}
    ${anyAxes ? `<div data-bars></div>` : `<div class="notice">Insufficient data: no axis has reached ${min} analyzed articles yet.</div>`}
    <h2 class="section-h">Analyzed articles</h2>
    <div class="article-list">${prof.articles.map(articleCard).join("")}</div>`;

  if (anyAxes) renderBarReadout(el.querySelector("[data-bars]"), vec, { counts });
}

function articleCard(c) {
  return `<a class="article-card" href="article.html#id=${encodeURIComponent(c.id)}">
    <span class="genre-chip genre-${c.genre} sm">${(GENRE_LABEL[c.genre] || c.genre)}</span>
    ${c.flagged ? `<span class="genre-chip caution sm">caution</span>` : ""}
    <span class="article-card-title">${escapeHtml(c.title || c.url || "Untitled")}</span>
  </a>`;
}

export function hashParams() {
  const h = (location.hash || "").replace(/^#/, "");
  const out = {};
  for (const kv of h.split("&")) { const i = kv.indexOf("="); if (i > 0) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); }
  return out;
}
