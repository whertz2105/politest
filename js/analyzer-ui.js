// analyzer-ui.js — shared rendering for the Analyzer pages (analyze / article /
// profile). Reuses the app's chart components (renderBarReadout, wireQuadrant)
// and axis metadata. Every analysis view carries the standing disclaimer.

import { AXES, AXIS_KEYS, axisByKey } from "./axes.js";
import { escapeHtml } from "./app.js";
import { renderBarReadout, wireQuadrant, lineChartCard } from "./charts2d.js";
import { leftRightScore, lrLabel } from "./leftright.js";

export { leftRightScore };

export const DISCLAIMER =
  `<p class="disclaimer">Automated analysis by a language model against a
   <a href="data.html#analyzer">published rubric</a>. Every score cites evidence from
   the text. It is a starting point, not a verdict.</p>`;

const GENRE_LABEL = { report: "Report", analysis: "Analysis", opinion: "Opinion", mixed: "Mixed" };

function sign(n) { return (n > 0 ? "+" : "") + n; }
function pctX(v) { return Math.max(0, Math.min(100, (v + 100) / 2)); }

// The left↔right composite (LR_WEIGHTS, leftRightScore, lrLabel) lives in
// ./leftright.js so the backend shares the exact same scoring.

// A compact left↔right indicator for list rows (right of an article title).
// `lr` is { x, hasSignal } (as computed by leftRightScore), or null.
export function miniLeftRightBar(lr) {
  if (!lr) return "";
  const x = Math.max(-100, Math.min(100, Number(lr.x) || 0));
  const pos = (x + 100) / 2;
  const title = lr.hasSignal ? `${lrLabel(x)} (${x > 0 ? "+" : ""}${x})` : "No partisan lean detected";
  return `<span class="lr-mini" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"><span class="lr-mini-marker" style="left:${pos}%"></span></span>`;
}

// A left↔right barline. Render either from an axes map (a single analysis) or
// from a precomputed { x, hasSignal } score (writer/source aggregate).
function lrBarHtml(x, hasSignal, note) {
  x = Math.max(-100, Math.min(100, Number(x) || 0));
  const pos = (x + 100) / 2;
  const label = hasSignal ? lrLabel(x) : "Centrist";
  const caption = hasSignal
    ? `<strong>${label}</strong> · <span class="lr-num">${sign(x)}</span> on the left–right scale`
    : `<strong>Centrist</strong> · no partisan lean detected on the measured dimensions`;
  return `<figure class="lr">
    <figcaption class="lr-caption">${caption}</figcaption>
    <div class="lr-track"><span class="lr-marker" style="left:${pos}%" title="${sign(x)}"></span></div>
    <div class="lr-scale"><span>Left · progressive</span><span>Center</span><span>Right · conservative</span></div>
    ${note ? `<p class="ns-note muted" style="margin:.35rem 0 0">${escapeHtml(note)}</p>` : ""}
  </figure>`;
}
export function renderLeftRightBar(axesMap) {
  const { x, hasSignal } = leftRightScore(axesMap);
  return lrBarHtml(x, hasSignal);
}
export function renderLeftRightBarScore(score, note) {
  score = score || { x: 0, hasSignal: false };
  return lrBarHtml(score.x, !!score.hasSignal, note);
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

  const neutral = rec.neutral_summary
    ? `<section class="neutral-summary"><h2 class="ns-h">What the article says</h2>
        <p>${escapeHtml(rec.neutral_summary)}</p>
        <p class="ns-note muted">A neutral summary of the substance, independent of the bias scan below.</p></section>`
    : "";

  // Up to 3 small quadrant charts pairing the strongest axes (need 2 axes each).
  const pairs = [];
  for (let i = 0; i + 1 < keys.length && pairs.length < 3; i += 2) pairs.push([keys[i], keys[i + 1]]);

  let html = `
    <div class="analysis-head">
      <span class="genre-chip genre-${rec.genre}">${GENRE_LABEL[rec.genre] || rec.genre}</span>
      ${rec.flagged ? `<span class="genre-chip caution">caution</span>` : ""}
      <h1>${escapeHtml(rec.title || "Untitled article")}</h1>
      <p class="analysis-meta">By ${writerLink} · ${sourceLink} · ${urlLine}</p>
      <p class="analysis-summary">${escapeHtml(rec.summary || "")}</p>
    </div>
    ${neutral}
    ${flagBanner(rec)}
    ${DISCLAIMER}
    ${renderLeftRightBar(rec.axes || {})}
    ${pairs.length ? `<div class="quad-row" data-quads></div>` : ""}`;

  if (!rec.stance_detected || keys.length === 0) {
    html += `<div class="notice notice-ok"><strong>No detectable stance.</strong>
      This piece read as straight reporting: no axis met the evidence bar. That is a valid and common result.</div>`;
  } else {
    html += `<div class="ax-list">${keys.map((k) => axisRow(k, rec.axes[k])).join("")}</div>`;
  }
  html += `<p class="rubric-stamp muted">Scored against the <a href="data.html#analyzer">published rubric &amp; methodology</a>.</p>`;
  el.innerHTML = html;

  if (pairs.length) {
    const vec = {};
    for (const k of AXIS_KEYS) vec[k] = rec.axes[k] ? rec.axes[k].score : 0;
    const row = el.querySelector("[data-quads]");
    for (const [x, y] of pairs) {
      const fig = document.createElement("figure");
      fig.className = "quad-mini";
      row.appendChild(fig);
      wireQuadrant(fig, vec, x, y, { title: `${axisByKey(x).label} × ${axisByKey(y).label}` });
    }
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

  // Left–right for the whole source/writer = the MEAN of each article's own
  // left–right position (computed server-side over each article's full axis set),
  // NOT a recompute from only the axes that reached the aggregate threshold. This
  // is why a source whose every article leans far-left reads far-left overall,
  // even when its signal is spread across many different axes.
  const lr = prof.lr || { x: 0, hasSignal: false };
  const lrNote = lr.hasSignal && lr.n
    ? `Average lean across ${lr.n} analyzed article${lr.n === 1 ? "" : "s"} with a detected stance.`
    : "";

  el.innerHTML = `
    <div class="analysis-head">
      <span class="genre-chip">${isWriter ? "Writer" : "Source"}</span>
      <h1>${escapeHtml(title)}${sub}</h1>
      <p class="analysis-meta">${prof.articleCount} analyzed article${prof.articleCount === 1 ? "" : "s"} ·
        axes aggregate at ${min}+ articles</p>
    </div>
    ${DISCLAIMER}
    ${renderLeftRightBarScore(lr, lrNote)}
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
    ${miniLeftRightBar(c.lr)}
  </a>`;
}

// ---- drift trend (writer / source profiles) ------------------------------
// `trend` is the /api/*-trend payload: { kind, key, all:[bucket], byGenre:{…} }.
// Renders the left↔right line + an axis picker + a genre filter + the genre-mix
// strip (the composition disclosure). Re-renders in place on any control change.
function genreStripHtml(buckets) {
  if (!buckets.length) return `<p class="muted">No buckets.</p>`;
  const genres = ["report", "analysis", "opinion", "mixed"];
  const rows = buckets.map((b) => {
    const total = genres.reduce((s, g) => s + (b.byGenre[g] || 0), 0) || 1;
    const segs = genres.map((g) => {
      const c = b.byGenre[g] || 0;
      return c ? `<span class="gs-seg ${g}" style="width:${(c / total * 100).toFixed(1)}%" title="${g}: ${c}"></span>` : "";
    }).join("");
    return `<div class="gs-row"><span class="gs-period">${escapeHtml(b.period)}</span><span class="gs-bars">${segs}</span></div>`;
  }).join("");
  const legend = genres.map((g) => `<span class="gs-key"><span class="gs-swatch ${g}"></span>${g}</span>`).join("");
  return `<div class="genre-strip">${rows}</div><div class="gs-legend">${legend}</div>`;
}

export function renderTrend(el, trend) {
  const subject = trend.kind === "writer" ? "Writer" : "Outlet";
  const genres = ["all", "report", "analysis", "opinion"];
  let genre = "all";
  let axisKey = "";

  const bucketsFor = () => (genre === "all" ? trend.all : (trend.byGenre[genre] || []));
  const seriesFor = (bk) => {
    const out = [{ name: "Left–right", color: "var(--accent)", unit: "LR", points: bk.map((b) => ({ label: b.period, value: b.lr })) }];
    if (axisKey) {
      const m = axisByKey(axisKey);
      out.push({ name: m.label, color: "var(--pos)", unit: m.label, points: bk.map((b) => ({ label: b.period, value: b.axes[axisKey] ? b.axes[axisKey].mean : null })) });
    }
    return out;
  };
  const poles = () => {
    if (!axisKey) return { posLabel: "Right", negLabel: "Left" };
    const m = axisByKey(axisKey);
    return { posLabel: m.posShort || m.posLabel, negLabel: m.negShort || m.negLabel };
  };

  function draw() {
    const bk = bucketsFor();
    const genreOpts = genres.map((g) => `<option value="${g}"${g === genre ? " selected" : ""}>${g === "all" ? "All genres" : g[0].toUpperCase() + g.slice(1)}</option>`).join("");
    const axisOpts = `<option value="">Left–right only</option>` +
      AXES.map((a) => `<option value="${a.key}"${a.key === axisKey ? " selected" : ""}>+ ${escapeHtml(a.label)}</option>`).join("");
    el.innerHTML = `
      <h2 class="section-h">${subject} drift over time</h2>
      <div class="trend-controls">
        <label style="display:inline-flex;align-items:center;gap:.4rem">Genre <select id="tr-genre">${genreOpts}</select></label>
        <label style="display:inline-flex;align-items:center;gap:.4rem">Plot axis <select id="tr-axis">${axisOpts}</select></label>
      </div>
      <div id="tr-chart"></div>
      <p class="muted" style="font-size:.8rem">Bucketed monthly; months with fewer than 3 analyses are omitted; genre mix shown because composition shifts can look like position shifts.</p>
      <h3 class="lb-h" style="margin-top:1rem">Genre mix per month</h3>
      ${genreStripHtml(bk)}`;
    const chart = el.querySelector("#tr-chart");
    if (bk.length >= 2) {
      chart.appendChild(lineChartCard(seriesFor(bk), {
        title: `${subject} drift`,
        caption: axisKey ? `Left–right + ${axisByKey(axisKey).label}` : "Left–right over time",
        filename: "politeion-drift.png", ...poles(),
      }));
    } else {
      chart.innerHTML = `<p class="muted">Not enough monthly buckets in this genre to plot (need ≥2).</p>`;
    }
    el.querySelector("#tr-genre").addEventListener("change", (e) => { genre = e.target.value; draw(); });
    el.querySelector("#tr-axis").addEventListener("change", (e) => { axisKey = e.target.value; draw(); });
  }
  draw();
}

export function hashParams() {
  const h = (location.hash || "").replace(/^#/, "");
  const out = {};
  for (const kv of h.split("&")) { const i = kv.indexOf("="); if (i > 0) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); }
  return out;
}
