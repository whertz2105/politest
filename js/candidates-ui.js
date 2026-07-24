// candidates-ui.js — shared DOM rendering for the Candidates pages (candidates /
// race / candidate). Pure-logic (validation, ids, match) lives in candidates.js;
// this module does the HTML. Receipts everywhere: every axis shows its evidence
// quotes linking the full analysis; the standing disclaimer is always present.

import { AXES, AXIS_KEYS, axisByKey } from "./axes.js";
import { escapeHtml } from "./app.js";
import { renderBarReadout } from "./charts2d.js";
import { miniLeftRightBar, renderLeftRightBarScore } from "./analyzer-ui.js";
import { matchScore, statusInfo, CAND_PROFILE_MIN } from "./candidates.js";

export const CANDIDATE_DISCLAIMER =
  "Profiles measure what candidates say in their own published words — rhetoric, not votes or conduct. Every score cites its evidence.";
export const THIN_COPY =
  "This candidate has published little first-person material; the profile will populate as the campaign produces speeches, op-eds, or transcripts.";

const PARTY = { R: "Republican", D: "Democrat", I: "Independent", L: "Libertarian", G: "Green" };
export function isThin(profile) { return !profile || profile.articleCount < (profile.profileMin || CAND_PROFILE_MIN); }

function statusChip(status) {
  const s = statusInfo(status);
  return `<span class="cand-status st-${escapeHtml(status || "")}" title="${escapeHtml(s.copy)}">${escapeHtml(s.label)}</span>`;
}
function partyTag(p) { return p ? `<span class="cand-party party-${escapeHtml(p)}">${escapeHtml(PARTY[p] || p)}</span>` : ""; }

// Top strongest qualifying axes (largest |mean|).
export function topAxes(profile, n = 3) {
  if (!profile || !profile.axes) return [];
  return Object.keys(profile.axes)
    .map((k) => ({ key: k, label: axisByKey(k).label, mean: profile.axes[k].mean, n: profile.axes[k].n }))
    .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean)).slice(0, n);
}

// Compact summary for a race card / list: lr mini + top-3 axes, or the thin state.
export function profileSummaryHtml(candidate, profile) {
  if (isThin(profile)) return `<p class="cand-thin muted">${escapeHtml(THIN_COPY)}</p>`;
  const top = topAxes(profile, 3).map((a) => {
    const m = axisByKey(a.key), pole = a.mean >= 0 ? m.posLabel : m.negLabel;
    return `<li>${escapeHtml(m.label)}: <span class="cand-pole ${a.mean >= 0 ? "pos" : "neg"}">${escapeHtml(pole)}</span> <span class="muted">${a.mean > 0 ? "+" : ""}${a.mean}</span></li>`;
  }).join("");
  return `<div class="cand-lr">${miniLeftRightBar(profile.lr)}<span class="muted" style="font-size:.75rem">left ↔ right</span></div>
    <ul class="cand-top">${top}</ul>
    <p class="muted" style="font-size:.75rem">from ${profile.articleCount} analyzed source${profile.articleCount === 1 ? "" : "s"}</p>`;
}

// A candidate cell for the side-by-side race view.
function candidateCellHtml(c, profile) {
  const s = statusInfo(c.status);
  const link = (!isThin(profile)) ? `<a class="btn cand-viewbtn" href="candidate.html#id=${encodeURIComponent(c.id)}">Full profile →</a>` : "";
  const body = s.pending
    ? `<p class="muted cand-pending">${escapeHtml(s.copy)}</p>`
    : (profileSummaryHtml(c, profile) + link);
  return `<div class="cand-cell">
    <div class="cand-cell-head"><span class="cand-name">${escapeHtml(c.name)}</span> ${partyTag(c.party)}</div>
    ${statusChip(c.status)}
    ${c.incumbentOffice ? `<div class="muted" style="font-size:.75rem">${escapeHtml(c.incumbentOffice)}</div>` : ""}
    ${body}
  </div>`;
}

// race: a parsed race { key, office, district, notes, candidates:[…] }.
// profileMap: { candidateId: profile } (may be missing → thin).
export function renderRace(el, race, profileMap) {
  const prof = (c) => profileMap[c.id] || null;
  const ballot = race.candidates.filter((c) => c.status !== "write_in_unverified");
  const writeIns = race.candidates.filter((c) => c.status === "write_in_unverified");
  el.innerHTML = `
    <div class="analysis-head">
      <span class="genre-chip">${escapeHtml(race.district || race.level || "race")}</span>
      <h1>${escapeHtml(race.office)}${race.district ? ` · ${escapeHtml(race.district)}` : ""}</h1>
      ${race.notes ? `<p class="analysis-meta">${escapeHtml(race.notes)}</p>` : ""}
    </div>
    <p class="disclaimer">${escapeHtml(CANDIDATE_DISCLAIMER)}</p>
    <div class="cand-grid">${ballot.map((c) => candidateCellHtml(c, prof(c))).join("")}</div>
    ${writeIns.length ? `<h2 class="section-h">Write-in candidates</h2>
      <p class="muted" style="font-size:.82rem">Listed as write-ins; on-ballot status unconfirmed.</p>
      <div class="cand-grid">${writeIns.map((c) => candidateCellHtml(c, prof(c))).join("")}</div>` : ""}`;
}

// Full candidate profile page.
export function renderCandidateFull(el, candidate, profile) {
  const officeLine = [candidate.office, candidate.district].filter(Boolean).join(" · ");
  let body;
  if (isThin(profile)) {
    body = `<div class="notice">${escapeHtml(THIN_COPY)}</div>`;
    if (profile && profile.sources && profile.sources.length) body += sourceListHtml(profile.sources);
  } else {
    const vec = {}, counts = {};
    for (const k of AXIS_KEYS) { const a = profile.axes[k]; vec[k] = a ? a.mean : 0; counts[k] = a ? a.n : 0; }
    body = renderLeftRightBarScore(profile.lr, profile.lr.hasSignal ? `Mean of ${profile.lr.n} source${profile.lr.n === 1 ? "" : "s"} with a detected lean.` : "") +
      `<h2 class="section-h">Where the words place them — 22 axes</h2><div data-bars></div>` +
      `<h2 class="section-h">Evidence</h2>${evidenceHtml(profile)}` +
      sourceListHtml(profile.sources);
    el.__vec = vec; el.__counts = counts;
  }
  el.innerHTML = `
    <div class="analysis-head">
      <span class="genre-chip">Candidate</span>
      <h1>${escapeHtml(candidate.name)}</h1>
      <p class="analysis-meta">${partyTag(candidate.party)} ${officeLine ? "· " + escapeHtml(officeLine) : ""} · ${statusChip(candidate.status)}</p>
    </div>
    <p class="disclaimer">${escapeHtml(CANDIDATE_DISCLAIMER)}</p>
    ${body}`;
  if (el.__vec) renderBarReadout(el.querySelector("[data-bars]"), el.__vec, { counts: el.__counts });
}

function evidenceHtml(profile) {
  const rows = AXIS_KEYS.filter((k) => profile.axes[k]).map((k) => {
    const a = profile.axes[k], m = axisByKey(k), pole = a.mean >= 0 ? m.posLabel : m.negLabel;
    const quotes = a.evidence.map((e) =>
      `<blockquote class="axrow-ev">“${escapeHtml(e.quote)}”<a class="cand-receipt" href="article.html#id=${encodeURIComponent(e.analysisId)}" title="full analysis of this source">↗</a></blockquote>`).join("");
    return `<div class="cand-evidence"><div class="axrow-head"><span class="axrow-name">${escapeHtml(m.label)}</span>
      <span class="axrow-pole ${a.mean >= 0 ? "pos" : "neg"}">${escapeHtml(pole)}</span>
      <span class="axrow-score ${a.mean >= 0 ? "pos" : "neg"}">${a.mean > 0 ? "+" : ""}${a.mean}</span>
      <span class="muted" style="font-size:.75rem">${a.n} source${a.n === 1 ? "" : "s"}</span></div>${quotes}</div>`;
  }).join("");
  return `<div class="ax-list">${rows}</div>`;
}

function sourceListHtml(sources) {
  if (!sources || !sources.length) return "";
  const items = sources.map((s) =>
    `<li><a href="${escapeHtml(s.url || "#")}" rel="nofollow noopener" target="_blank">${escapeHtml(s.title || s.url || "source")}</a>
      ${s.flagged ? '<span class="tag warn">flagged</span>' : ""}
      <a class="muted cand-receipt" href="article.html#id=${encodeURIComponent(s.id)}" title="analysis">↗ analysis</a></li>`).join("");
  return `<h2 class="section-h">Sources</h2><ul class="cand-sources">${items}</ul>`;
}

// ---- match panel ("what matters most to you") ----------------------------
// entries: [{ id, name, party, profile }]. weights live in localStorage (dc_weights).
export function renderMatchPanel(container, userVec, entries) {
  let weights = {};
  try { weights = JSON.parse(localStorage.getItem("dc_weights") || "{}"); } catch { weights = {}; }
  const wOf = (k) => (weights[k] == null ? 1 : weights[k]);

  function rankHtml() {
    const ranked = entries.map((e) => {
      if (isThin(e.profile)) return { e, thin: true };
      const m = matchScore(userVec, e.profile.axes, weights);
      return { e, thin: false, m };
    }).sort((a, b) => {
      if (a.thin && b.thin) return 0;
      if (a.thin) return 1; if (b.thin) return -1;
      return ((b.m && b.m.pct) || -1) - ((a.m && a.m.pct) || -1);
    });
    return ranked.map((r) => {
      if (r.thin) return `<li class="match-row"><span class="match-name">${escapeHtml(r.e.name)}</span><span class="muted">not enough published material to compare</span></li>`;
      if (!r.m) return `<li class="match-row"><span class="match-name">${escapeHtml(r.e.name)}</span><span class="muted">no matching axes at your current weights</span></li>`;
      return `<li class="match-row"><span class="match-name">${escapeHtml(r.e.name)}</span>
        <span class="match-pct">${r.m.pct}%</span>
        <span class="muted match-detail">based on ${r.m.axesUsed} axis${r.m.axesUsed === 1 ? "" : "es"} with sufficient data · weighted by your priorities</span></li>`;
    }).join("");
  }
  function togglesHtml() {
    return AXES.map((a) => {
      const w = wOf(a.key);
      const btn = (val, label, cls) => `<button type="button" class="wt-btn ${w === val ? "on " + cls : ""}" data-axis="${a.key}" data-w="${val}">${label}</button>`;
      return `<div class="wt-row"><span class="wt-label">${escapeHtml(a.label)}</span>
        <span class="wt-toggle">${btn(0, "mute", "mute")}${btn(1, "1×", "norm")}${btn(2, "2×", "boost")}</span></div>`;
    }).join("");
  }
  function draw() {
    container.innerHTML = `
      <div class="match-cols">
        <div class="match-ranking"><h3 class="lb-h">Your match</h3><ol class="match-list">${rankHtml()}</ol></div>
        <details class="match-weights"><summary>What matters most to you (${AXES.length} axes)</summary>
          <p class="muted" style="font-size:.78rem">Mute an axis to ignore it, or boost one that matters more. Ranking updates live.</p>
          <div class="wt-grid">${togglesHtml()}</div>
          <div class="btn-row" style="margin-top:.5rem"><button class="btn" type="button" id="wt-reset" style="min-height:34px">Reset weights</button></div>
        </details>
      </div>`;
    container.querySelectorAll(".wt-btn").forEach((b) => b.addEventListener("click", () => {
      weights[b.dataset.axis] = Number(b.dataset.w);
      try { localStorage.setItem("dc_weights", JSON.stringify(weights)); } catch { /* ignore */ }
      draw();
    }));
    const reset = container.querySelector("#wt-reset");
    if (reset) reset.addEventListener("click", () => { weights = {}; try { localStorage.removeItem("dc_weights"); } catch { /* ignore */ } draw(); });
  }
  draw();
}
