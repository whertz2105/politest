// charts2d.js — inline-SVG 2D visualisations. No external deps.
import { AXES, axisByKey } from "./axes.js";
import { escapeHtml } from "./app.js";

// ---------------------------------------------------------------------------
// 22-row horizontal bar readout (accessible HTML + inline SVG bars).
// ---------------------------------------------------------------------------
export function renderBarReadout(container, vector, opts = {}) {
  const { counts, bands, consistency, percentiles, approximated } = opts;
  const pctX = (v) => Math.max(0, Math.min(100, (v + 100) / 2));
  const sign = (v) => (v > 0 ? "+" : "") + v.toFixed(1);

  const rows = AXES.map((a) => {
    const k = a.key;
    const score = Math.round((Number(vector[k]) || 0) * 10) / 10;
    const n = counts ? counts[k] : undefined;
    const awaiting = n === 0;
    const dir = score >= 0 ? "pos" : "neg";

    if (awaiting) {
      return `<div class="bar-row awaiting">
        <div class="bar-head"><span class="bar-axis">${escapeHtml(a.label)}</span><span class="bar-count">awaiting items</span></div>
        <div class="bar-track"><span class="pole neg">${escapeHtml(a.negLabel)}</span>
          <svg class="bar-svg" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><line x1="50" y1="0" x2="50" y2="12" class="bar-mid"/></svg>
          <span class="pole pos">${escapeHtml(a.posLabel)}</span></div></div>`;
    }

    const band = bands && bands.lo ? { lo: bands.lo[k], hi: bands.hi[k] } : null;
    const spansZero = bands && bands.spansZero ? bands.spansZero[k] : false;
    const warn = consistency && consistency.axisWarn && consistency.axisWarn[k];
    const pctVal = percentiles && percentiles[k] != null ? percentiles[k] : null;
    const approx = approximated && approximated.includes(k);

    const from = Math.min(50, pctX(score));
    const width = Math.abs(pctX(score) - 50);
    const centered = Math.abs(score) < 0.05;
    const scoreHtml = !spansZero
      ? `<span class="bar-score ${dir}">${sign(score)}</span>`
      : centered
        ? `<span class="bar-score leans" title="confidence band spans zero — no clear lean">centered <span class="muted">(0.0)</span></span>`
        : `<span class="bar-score leans" title="band spans zero — sign not firmly determined">leans ${escapeHtml(score >= 0 ? a.posLabel : a.negLabel)} <span class="muted">(${sign(score)})</span></span>`;
    const whisker = band && band.lo !== band.hi
      ? `<line x1="${pctX(band.lo)}" y1="6" x2="${pctX(band.hi)}" y2="6" class="ci-line"/>
         <line x1="${pctX(band.lo)}" y1="2.5" x2="${pctX(band.lo)}" y2="9.5" class="ci-cap"/>
         <line x1="${pctX(band.hi)}" y1="2.5" x2="${pctX(band.hi)}" y2="9.5" class="ci-cap"/>` : "";

    return `<div class="bar-row${spansZero ? " uncertain" : ""}">
      <div class="bar-head">
        <span class="bar-axis">${escapeHtml(a.label)}</span>
        ${approx ? `<span class="tag approx" title="v1 bank: this fused axis was split and approximated">v1 approx</span>` : ""}
        ${warn ? `<span class="tag warn" title="answers on this axis were internally inconsistent">⚠ reliability</span>` : ""}
        ${pctVal !== null ? `<span class="bar-count" title="percentile vs the crowd">${ordinal(pctVal)} pct</span>`
          : (n !== undefined ? `<span class="bar-count">${n} item${n === 1 ? "" : "s"}</span>` : "")}
        ${scoreHtml}
      </div>
      <div class="bar-track" role="img" aria-label="${escapeHtml(a.label)}: ${score}">
        <span class="pole neg">${escapeHtml(a.negLabel)}</span>
        <svg class="bar-svg" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
          <line x1="50" y1="0" x2="50" y2="12" class="bar-mid"/>
          <rect x="${from}" y="3.5" width="${width}" height="5" rx="1" class="bar-fill ${dir}"/>
          ${whisker}
        </svg>
        <span class="pole pos">${escapeHtml(a.posLabel)}</span>
      </div>
    </div>`;
  }).join("");
  container.innerHTML = `<div class="bar-readout">${rows}</div>`;
}
function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// ---------------------------------------------------------------------------
// Text measurement (browser canvas; length estimate as a headless fallback).
// ---------------------------------------------------------------------------
let _mctx = null;
function measureText(str, fontPx) {
  try {
    if (!_mctx) _mctx = document.createElement("canvas").getContext("2d");
    const fam = (getComputedStyle(document.body).fontFamily) || "sans-serif";
    _mctx.font = `500 ${fontPx}px ${fam}`;
    return _mctx.measureText(str).width;
  } catch { return String(str).length * fontPx * 0.55; }
}

// ---------------------------------------------------------------------------
// Quadrant scatter. ALL four pole labels are DERIVED from axes.js at render time
// for {xKey, yKey}: xNeg left, xPos right (horizontal, bottom gutter halves);
// yPos upper, yNeg lower (rotated 90° in the LEFT gutter, reading bottom-to-top).
// One shared 4%-inner-padded scale maps −100..+100 into the plot for EVERY marker.
// ---------------------------------------------------------------------------
const INNER_PAD = 0.04;

export function quadrantSVG(vector, xKey, yKey, opts = {}) {
  const size = opts.size || 300;
  const forceShort = !!opts.shortLabels;
  const font = Math.max(9, Math.min(15, Math.round(size * 0.037)));
  const gL = Math.round(font * 2.5), gB = Math.round(font * 2.3), gT = Math.round(font * 1.5), gR = Math.round(font * 1.2);
  const plot = size, x0 = gL, y0 = gT, W = gL + plot + gR, H = gT + plot + gB;
  const ax = axisByKey(xKey), ay = axisByKey(yKey);

  // one shared scale — 4% inner padding so ±100 renders inside the frame
  const toX = (v) => x0 + (INNER_PAD + (1 - 2 * INNER_PAD) * ((v + 100) / 200)) * plot;
  const toY = (v) => y0 + (INNER_PAD + (1 - 2 * INNER_PAD) * ((100 - v) / 200)) * plot;
  const midX = x0 + plot / 2, midY = y0 + plot / 2;
  const r1 = (n) => Math.round(n * 10) / 10;
  // data-* only (the circle carries its own class incl. "dot" — no duplicate class attr)
  const tip = (name, xv, yv) => `data-name="${escapeHtml(name)}" data-x="${r1(xv)}" data-y="${r1(yv)}" data-xa="${escapeHtml(ax.label)}" data-ya="${escapeHtml(ay.label)}"`;

  // quadrant tints
  const q = (x, y, w, h, cls) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="quad ${cls}"/>`;
  const tints = q(x0, y0, plot / 2, plot / 2, "q-tl") + q(midX, y0, plot / 2, plot / 2, "q-tr") +
    q(x0, midY, plot / 2, plot / 2, "q-bl") + q(midX, midY, plot / 2, plot / 2, "q-br");

  // markers ------------------------------------------------------------------
  let cloudMarks = "";
  if (opts.cloud && opts.cloud.length) {  // anonymous crowd — no tooltip
    cloudMarks = opts.cloud.map((p) => `<circle cx="${toX(p[0])}" cy="${toY(p[1])}" r="2.5" class="cloud-dot"/>`).join("");
  }
  let archMarks = "";
  if (opts.archetypes && opts.archetypes.length) {
    archMarks = opts.archetypes.map((a) =>
      `<circle cx="${toX(a.v[xKey] || 0)}" cy="${toY(a.v[yKey] || 0)}" r="3" class="arch-dot dot" ${tip(a.name, a.v[xKey] || 0, a.v[yKey] || 0)}></circle>`).join("");
  }

  // figure markers: every figure is a hover-only dot; we label just ONE figure
  // per quadrant (the most extreme in each) to keep the chart uncluttered now
  // that tooltips exist. Quadrant is the sign of this chart's two axes.
  let figMarks = "";
  if (opts.figures && opts.figures.length) {
    const best = {}; // quadrant -> { name, dist }
    for (const f of opts.figures) {
      const xv = f.v[xKey] || 0, yv = f.v[yKey] || 0;
      const qk = (xv >= 0 ? "R" : "L") + (yv >= 0 ? "T" : "B");
      const dist = xv * xv + yv * yv;
      if (!best[qk] || dist > best[qk].dist) best[qk] = { name: f.name, dist };
    }
    const labelSet = new Set(Object.values(best).map((b) => b.name));
    const labelled = opts.figures.map((f) => ({ f, x: toX(f.v[xKey] || 0), y: toY(f.v[yKey] || 0), show: labelSet.has(f.name) }));
    if (opts.nudge) {
      const gap = font * 1.15;
      labelled.filter((d) => d.show).sort((a, b) => a.y - b.y)
        .reduce((last, d) => { d.ly = d.y - 5 < last + gap ? last + gap : d.y - 5; return d.ly; }, -Infinity);
    }
    figMarks = labelled.map((d) => {
      let lbl = "";
      if (d.show) {
        // Anchor the label toward center so it never runs off the frame edge:
        // right-half dots label leftward (text-anchor:end), left-half rightward.
        const rightHalf = d.x > midX;
        const lx = rightHalf ? d.x - 6 : d.x + 6;
        const anchor = rightHalf ? "end" : "start";
        let ly = d.ly != null ? d.ly : d.y - 5;
        const topLimit = y0 + font, botLimit = y0 + plot - 2;
        if (ly < topLimit) ly = d.y + font + 2; // too near the top → place below the dot
        if (ly > botLimit) ly = botLimit;        // clamp inside the bottom of the frame
        lbl = `<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="fig-lbl" style="font-size:${Math.max(8, font - 1)}px">${escapeHtml(d.f.name)}</text>`;
      }
      return `<g><circle cx="${d.x}" cy="${d.y}" r="4" class="fig-dot dot" ${tip(d.f.name, d.f.v[xKey] || 0, d.f.v[yKey] || 0)}></circle>${lbl}</g>`;
    }).join("");
  }

  const ux = toX(vector[xKey] || 0), uy = toY(vector[yKey] || 0);

  // "The shrinking dot": when per-axis σ is supplied, the halo grows with the mean
  // uncertainty of the two plotted axes (σ 3 → tight halo, σ 25 → large soft halo),
  // and the You tooltip carries ±σ. Precise runs literally shrink the dot.
  const sig = opts.sigma || null;
  const sx = sig && Number.isFinite(sig[xKey]) ? sig[xKey] : null;
  const sy = sig && Number.isFinite(sig[yKey]) ? sig[yKey] : null;
  const haloR = (sx != null && sy != null)
    ? Math.max(7, Math.min(22, 7 + (((sx + sy) / 2 - 3) / (25 - 3)) * (22 - 7)))
    : 11;
  const youDX = sx != null ? `${r1(vector[xKey] || 0)} ±${r1(sx)}` : r1(vector[xKey] || 0);
  const youDY = sy != null ? `${r1(vector[yKey] || 0)} ±${r1(sy)}` : r1(vector[yKey] || 0);
  const youTip = `data-name="You" data-x="${youDX}" data-y="${youDY}" data-xa="${escapeHtml(ax.label)}" data-ya="${escapeHtml(ay.label)}"`;

  // pole labels (derived; short-label fallback when the full label won't fit) ---
  const halfW = plot / 2 - font;
  const fit = (full, short) => (forceShort || measureText(full, font) > halfW) ? short : full;
  const xNeg = fit(ax.negLabel, ax.negShort), xPos = fit(ax.posLabel, ax.posShort);
  const yPos = fit(ay.posLabel, ay.posShort), yNeg = fit(ay.negLabel, ay.negShort);
  const xLabY = y0 + plot + Math.round(gB * 0.72);
  const yLx = Math.round(gL * 0.4);
  const yPosY = y0 + plot * 0.25, yNegY = y0 + plot * 0.75;

  return `
  <svg class="quad-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"
       aria-label="${escapeHtml(ax.label)} vs ${escapeHtml(ay.label)}">
    <rect x="0" y="0" width="${W}" height="${H}" class="quad-bg"/>
    ${tints}
    <line x1="${midX}" y1="${y0}" x2="${midX}" y2="${y0 + plot}" class="quad-axis"/>
    <line x1="${x0}" y1="${midY}" x2="${x0 + plot}" y2="${midY}" class="quad-axis"/>
    <rect x="${x0}" y="${y0}" width="${plot}" height="${plot}" class="quad-frame"/>
    ${cloudMarks}${archMarks}${figMarks}
    <circle cx="${ux}" cy="${uy}" r="${r1(haloR)}" class="you-halo"/>
    <circle cx="${ux}" cy="${uy}" r="6" class="you-dot dot" ${youTip}></circle>
    <text class="pole-lbl xneg" x="${x0 + plot * 0.25}" y="${xLabY}" style="font-size:${font}px">${escapeHtml(xNeg)}</text>
    <text class="pole-lbl xpos" x="${x0 + plot * 0.75}" y="${xLabY}" style="font-size:${font}px">${escapeHtml(xPos)}</text>
    <text class="pole-lbl ypos" x="${yLx}" y="${yPosY}" transform="rotate(-90 ${yLx} ${yPosY})" style="font-size:${font}px">${escapeHtml(yPos)}</text>
    <text class="pole-lbl yneg" x="${yLx}" y="${yNegY}" transform="rotate(-90 ${yLx} ${yNegY})" style="font-size:${font}px">${escapeHtml(yNeg)}</text>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Single-axis number line: user marker + every archetype's position on ONE axis.
// ---------------------------------------------------------------------------
export function axisLineSVG(userVec, axisKey, archetypes, labelNames) {
  const a = axisByKey(axisKey);
  const W = 460, H = 96, padX = 24, midY = 48;
  const x0 = padX, x1 = W - padX, span = x1 - x0;
  const toX = (v) => x0 + (0.04 + 0.92 * ((v + 100) / 200)) * span;
  const u = userVec[axisKey] || 0;
  const labelSet = labelNames ? new Set(labelNames) : null;

  const ticks = archetypes.map((arch, i) => {
    const x = toX(arch.v[axisKey] || 0);
    const show = !labelSet || labelSet.has(arch.name);
    const above = i % 2 === 0;
    const ly = above ? midY - 12 : midY + 20;
    const lbl = show ? `<text x="${x}" y="${ly}" class="axl-arch">${escapeHtml(arch.name)}</text>` : "";
    return `<line x1="${x}" y1="${midY - 5}" x2="${x}" y2="${midY + 5}" class="axl-tick dot" data-name="${escapeHtml(arch.name)}" data-x="${arch.v[axisKey]}" data-xa="${escapeHtml(a.label)}"><title>${escapeHtml(arch.name)}: ${arch.v[axisKey]}</title></line>${lbl}`;
  }).join("");

  const ux = toX(u);
  return `
  <svg class="axis-line" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"
       aria-label="Archetype positions on ${escapeHtml(a.label)}">
    <line x1="${x0}" y1="${midY}" x2="${x1}" y2="${midY}" class="axl-axis"/>
    <line x1="${toX(0)}" y1="${midY - 8}" x2="${toX(0)}" y2="${midY + 8}" class="axl-zero"/>
    ${ticks}
    <line x1="${ux}" y1="${midY - 14}" x2="${ux}" y2="${midY + 14}" class="axl-you"/>
    <circle cx="${ux}" cy="${midY}" r="5" class="axl-you-dot"><title>You: ${Math.round(u * 10) / 10}</title></circle>
    <text x="${x0}" y="${H - 6}" class="axl-pole neg">${escapeHtml(a.negLabel)}</text>
    <text x="${x1}" y="${H - 6}" class="axl-pole pos">${escapeHtml(a.posLabel)}</text>
    <text x="${ux}" y="${midY - 20}" class="axl-you-lbl">You</text>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Interactivity: hover/tap tooltips on every .dot[data-name], and a fullscreen
// lightbox that RE-RENDERS the chart fresh at large size.
// ---------------------------------------------------------------------------
function tipEl() {
  let t = document.getElementById("chart-tip");
  if (!t) { t = document.createElement("div"); t.id = "chart-tip"; t.className = "chart-tip"; document.body.appendChild(t); }
  return t;
}
function showTip(dot, x, y) {
  const t = tipEl();
  const name = dot.getAttribute("data-name");
  const xa = dot.getAttribute("data-xa"), xv = dot.getAttribute("data-x");
  const ya = dot.getAttribute("data-ya"), yv = dot.getAttribute("data-y");
  let detail = "";
  if (xa && xv != null) detail += `${escapeHtml(xa)} ${xv}`;
  if (ya && yv != null) detail += `${detail ? " · " : ""}${escapeHtml(ya)} ${yv}`;
  t.innerHTML = `<b>${escapeHtml(name)}</b>${detail ? `<span>${detail}</span>` : ""}`;
  t.style.left = x + "px"; t.style.top = y + "px";
  t.classList.add("show");
}
function hideTip() { const t = document.getElementById("chart-tip"); if (t) t.classList.remove("show"); }

let _docTipWired = false;
export function attachTooltips(container) {
  if (!_docTipWired) { document.addEventListener("click", hideTip, { passive: true }); _docTipWired = true; }
  if (container.__tipWired) return;   // idempotent — safe across re-renders of the same node
  container.__tipWired = true;
  container.addEventListener("pointermove", (e) => {
    const d = e.target.closest && e.target.closest(".dot[data-name]");
    if (d) showTip(d, e.clientX + 12, e.clientY + 12); else if (e.pointerType === "mouse") hideTip();
  });
  container.addEventListener("pointerleave", hideTip);
  container.addEventListener("click", (e) => {
    const d = e.target.closest && e.target.closest(".dot[data-name]");
    if (d) { showTip(d, e.clientX + 12, e.clientY + 12); e.stopPropagation(); }
  });
}

export function openChartModal({ title, render, filename }) {
  const small = window.innerWidth < 700;
  // render size: large, leaving room for the modal chrome and viewport.
  const s = Math.round(Math.min(window.innerWidth * (small ? 0.92 : 0.86), window.innerHeight * 0.74));
  const overlay = document.createElement("div");
  overlay.className = "chart-modal";
  overlay.innerHTML = `<div class="chart-modal-inner" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || "chart")}">
      <div class="chart-modal-head"><span>${escapeHtml(title || "")}</span><button class="chart-modal-close" aria-label="Close">✕</button></div>
      <div class="chart-modal-body"></div>
      <div class="chart-modal-foot"><button class="btn dl-png">Download PNG</button></div>
    </div>`;
  const body = overlay.querySelector(".chart-modal-body");
  body.innerHTML = render(s);
  // the modal is a shrink-to-fit flex column, so give the SVG an explicit pixel
  // width (otherwise width:100% resolves against a collapsed container -> tiny).
  const svgEl = body.querySelector("svg");
  if (svgEl) { svgEl.style.width = s + "px"; svgEl.style.maxWidth = "100%"; svgEl.style.height = "auto"; }
  attachTooltips(body);
  const close = () => { hideTip(); overlay.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector(".chart-modal-close").addEventListener("click", close);
  overlay.querySelector(".dl-png").addEventListener("click", () => downloadSvgAsPng(body.querySelector("svg"), filename || "politeion.png"));
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

// Paint a quadrant into a <figure>, wire tooltips + click-to-expand (modal).
function paintQuadrant(fig, vector, xKey, yKey, opts) {
  const ax = axisByKey(xKey), ay = axisByKey(yKey);
  fig.className = "chart-card zoomable";
  fig.innerHTML = quadrantSVG(vector, xKey, yKey, opts) +
    `<button class="chart-expand" type="button" title="Expand" aria-label="Expand chart">⤢</button>` +
    (opts.caption === false ? "" : `<figcaption>${escapeHtml(ax.label)} × ${escapeHtml(ay.label)}</figcaption>`);
  attachTooltips(fig);
  const open = () => openChartModal({
    title: `${ax.label} × ${ay.label}`,
    filename: `politeion-${xKey}-${yKey}.png`,
    render: (s) => quadrantSVG(vector, xKey, yKey, {
      ...opts, size: s, shortLabels: false, nudge: true,
      labelNames: opts.figures ? opts.figures.map((f) => f.name) : opts.labelNames,
    }),
  });
  fig.querySelector(".chart-expand").addEventListener("click", (e) => { e.stopPropagation(); open(); });
  const svg = fig.querySelector("svg");
  svg.addEventListener("click", (e) => { if (!(e.target.closest && e.target.closest(".dot[data-name]"))) open(); });
  return fig;
}
export function quadrantCard(vector, xKey, yKey, opts = {}) { return paintQuadrant(document.createElement("figure"), vector, xKey, yKey, opts); }
export function wireQuadrant(figEl, vector, xKey, yKey, opts = {}) { return paintQuadrant(figEl, vector, xKey, yKey, opts); }

// ---------------------------------------------------------------------------
// Time-series line chart. One shared renderer for outlet/writer drift.
// `series`: [{ name, color, unit?, points:[{ label, value }] }]. x is the union of
// bucket labels (categorical, evenly spaced); y is −100..+100 with a zero line.
// Every point is a .dot[data-name] so attachTooltips shows "<name> — <label>: value".
// ---------------------------------------------------------------------------
export function lineChartSVG(series, opts = {}) {
  const W = opts.width || 640, H = opts.height || 300;
  const padL = 52, padR = 18, padT = 18, padB = 44;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const yMin = opts.yMin != null ? opts.yMin : -100, yMax = opts.yMax != null ? opts.yMax : 100;
  const labels = opts.labels || [...new Set(series.flatMap((s) => s.points.map((p) => p.label)))].sort();
  const n = labels.length;
  const r1 = (v) => Math.round(v * 10) / 10;
  const xAt = (label) => padL + (n <= 1 ? plotW / 2 : (labels.indexOf(label) / (n - 1)) * plotW);
  const yAt = (v) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  let grid = "";
  for (const gv of [yMax, 0, yMin]) {
    const gy = yAt(gv);
    grid += `<line x1="${padL}" y1="${r1(gy)}" x2="${padL + plotW}" y2="${r1(gy)}" class="lc-grid${gv === 0 ? " lc-zero" : ""}"/>`;
    grid += `<text x="${padL - 7}" y="${r1(gy) + 3}" class="lc-ytick">${gv > 0 ? "+" : ""}${gv}</text>`;
  }
  let xlabs = "";
  for (const lb of labels) xlabs += `<text x="${r1(xAt(lb))}" y="${H - padB + 18}" class="lc-xtick">${escapeHtml(lb)}</text>`;

  let lines = "";
  for (const s of series) {
    const pts = s.points.filter((p) => Number.isFinite(p.value));
    if (!pts.length) continue;
    const col = s.color || "var(--accent)";
    const poly = pts.map((p) => `${r1(xAt(p.label))},${r1(yAt(p.value))}`).join(" ");
    lines += `<polyline points="${poly}" fill="none" class="lc-line" style="stroke:${col}"/>`;
    lines += pts.map((p) =>
      `<circle cx="${r1(xAt(p.label))}" cy="${r1(yAt(p.value))}" r="4" class="lc-dot dot" style="fill:${col}"` +
      ` data-name="${escapeHtml(s.name + " — " + p.label)}" data-xa="${escapeHtml(s.unit || "score")}" data-x="${r1(p.value)}"></circle>`).join("");
  }

  const posL = opts.posLabel || "", negL = opts.negLabel || "";
  const poles = (posL || negL) ? `
    <text x="13" y="${r1(padT + plotH * 0.25)}" transform="rotate(-90 13 ${r1(padT + plotH * 0.25)})" class="lc-pole">${escapeHtml(posL)}</text>
    <text x="13" y="${r1(padT + plotH * 0.75)}" transform="rotate(-90 13 ${r1(padT + plotH * 0.75)})" class="lc-pole">${escapeHtml(negL)}</text>` : "";

  return `<svg class="line-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(opts.title || "trend")}">
    <rect x="0" y="0" width="${W}" height="${H}" class="quad-bg"/>
    ${grid}${poles}${xlabs}${lines}
  </svg>`;
}

function paintLineChart(fig, series, opts) {
  fig.className = "chart-card zoomable";
  fig.innerHTML = lineChartSVG(series, opts) +
    `<button class="chart-expand" type="button" title="Expand" aria-label="Expand chart">⤢</button>` +
    (opts.caption ? `<figcaption>${escapeHtml(opts.caption)}</figcaption>` : "");
  attachTooltips(fig);
  const open = () => openChartModal({
    title: opts.title || "Trend",
    filename: opts.filename || "politeion-trend.png",
    render: (s) => lineChartSVG(series, { ...opts, width: Math.round(s * 1.5), height: Math.round(s * 0.72) }),
  });
  fig.querySelector(".chart-expand").addEventListener("click", (e) => { e.stopPropagation(); open(); });
  const svg = fig.querySelector("svg");
  svg.addEventListener("click", (e) => { if (!(e.target.closest && e.target.closest(".dot[data-name]"))) open(); });
  return fig;
}
export function lineChartCard(series, opts = {}) { return paintLineChart(document.createElement("figure"), series, opts); }
export function wireLineChart(figEl, series, opts = {}) { return paintLineChart(figEl, series, opts); }

// ---------------------------------------------------------------------------
// Dev assertions (call with ?devcharts or from tests). Verifies (1) each pole
// label matches the axes.js pole for its position, and (3) no marker falls
// outside the plot rect for any score in [−100,100].
// ---------------------------------------------------------------------------
export function runChartDevAssertions() {
  const errs = [];
  const grab = (svg, cls) => { const m = new RegExp(`class="pole-lbl ${cls}"[^>]*>([^<]*)<`).exec(svg); return m ? m[1] : "(missing)"; };
  for (const [x, y] of [["mkt", "soc"], ["trust_sys", "meth_scope"], ["env", "fp"]]) {
    const ax = axisByKey(x), ay = axisByKey(y);
    const svg = quadrantSVG({}, x, y, { size: 320 });
    const cases = [["xneg", ax.negLabel, ax.negShort], ["xpos", ax.posLabel, ax.posShort],
                   ["ypos", ay.posLabel, ay.posShort], ["yneg", ay.negLabel, ay.negShort]];
    for (const [cls, full, short] of cases) {
      const got = grab(svg, cls);
      if (got !== full && got !== short) errs.push(`${x}×${y} ${cls} = "${got}" (expected "${full}" or "${short}")`);
    }
  }
  // transform bounds: scale must keep every score inside [x0, x0+plot]
  const size = 300, font = Math.max(9, Math.min(15, Math.round(size * 0.037)));
  const gL = Math.round(font * 2.5), plot = size, x0 = gL;
  const toX = (v) => x0 + (INNER_PAD + (1 - 2 * INNER_PAD) * ((v + 100) / 200)) * plot;
  for (const v of [-100, -50, 0, 50, 100]) {
    const px = toX(v);
    if (px < x0 - 0.01 || px > x0 + plot + 0.01) errs.push(`point ${v} -> ${px.toFixed(1)} outside [${x0}, ${x0 + plot}]`);
  }
  if (typeof console !== "undefined") console[errs.length ? "error" : "log"]("[chart dev assertions]", errs.length ? errs : "OK");
  return errs;
}

// ---------------------------------------------------------------------------
// SVG -> PNG download (canvas). Rotated pole labels survive because the rotation
// lives in the SVG markup (a transform attribute), not the canvas text API — we
// rasterise the serialized SVG as an image.
// ---------------------------------------------------------------------------
export function downloadSvgAsPng(svgEl, filename = "politeion.png", scale = 2) {
  const clone = svgEl.cloneNode(true);
  inlineStyles(svgEl, clone);
  const xml = new XMLSerializer().serializeToString(clone);
  const svg64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  const vb = svgEl.viewBox.baseVal;
  const w = (vb && vb.width) || svgEl.clientWidth || 600;
  const h = (vb && vb.height) || svgEl.clientHeight || 600;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w * scale; canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };
  img.src = svg64;
}

function inlineStyles(srcRoot, cloneRoot) {
  const props = ["fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity",
    "font-size", "font-family", "font-weight", "text-anchor", "dominant-baseline"];
  const srcNodes = srcRoot.querySelectorAll("*");
  const cloneNodes = cloneRoot.querySelectorAll("*");
  const rootStyle = getComputedStyle(srcRoot);
  cloneRoot.setAttribute("style", props.map((p) => `${p}:${rootStyle.getPropertyValue(p)}`).join(";"));
  srcNodes.forEach((node, i) => {
    const cs = getComputedStyle(node);
    if (cloneNodes[i]) cloneNodes[i].setAttribute("style", props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";"));
  });
}
