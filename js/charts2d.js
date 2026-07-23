// charts2d.js — inline-SVG 2D visualisations. No external deps.
import { AXES, axisByKey } from "./axes.js";
import { escapeHtml } from "./app.js";

// ---------------------------------------------------------------------------
// 18-row horizontal bar readout (built as accessible HTML + inline SVG bars).
// ---------------------------------------------------------------------------
// opts: { counts, bands (bootstrap {lo,hi,spansZero}), consistency ({axisWarn}),
//         percentiles ({key:0..100}), approximated ([keys]) } — all optional.
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
// Quadrant chart (inline SVG string). xKey on horizontal, yKey on vertical
// (positive up). Optional archetype markers.
// ---------------------------------------------------------------------------
export function quadrantSVG(vector, xKey, yKey, opts = {}) {
  const size = opts.size || 300;
  // Labels sit in the margins on their own rows/corners so long pole names never
  // clip off-canvas. Horizontal poles go in the BOTTOM corners (full plot width
  // to breathe); vertical poles are centred top and bottom.
  const padSide = 20, padTop = 26, padBottom = 52;
  const plot = size;
  const W = plot + padSide * 2;
  const H = plot + padTop + padBottom;
  const ax = axisByKey(xKey), ay = axisByKey(yKey);
  const cx = padSide, cy = padTop;
  const labelSet = opts.labelNames ? new Set(opts.labelNames) : null; // figures to label (declutter)

  const toX = (v) => cx + ((v + 100) / 200) * plot;
  const toY = (v) => cy + ((100 - v) / 200) * plot; // positive up

  const px = toX(vector[xKey] || 0);
  const py = toY(vector[yKey] || 0);

  // quadrant tints
  const midX = cx + plot / 2, midY = cy + plot / 2;
  const q = (x, y, w, h, cls) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="quad ${cls}"/>`;
  const tints =
    q(cx, cy, plot / 2, plot / 2, "q-tl") +
    q(midX, cy, plot / 2, plot / 2, "q-tr") +
    q(cx, midY, plot / 2, plot / 2, "q-bl") +
    q(midX, midY, plot / 2, plot / 2, "q-br");

  // archetype markers
  let archMarks = "";
  if (opts.archetypes && opts.archetypes.length) {
    archMarks = opts.archetypes.map((a) => {
      const x = toX(a.v[xKey] || 0), y = toY(a.v[yKey] || 0);
      return `<circle cx="${x}" cy="${y}" r="3" class="arch-dot"><title>${escapeHtml(a.name)}</title></circle>`;
    }).join("");
  }

  // crowd cloud: many translucent dots (drawn behind everything else).
  // opts.cloud is an array of [xScore, yScore] pairs already projected to the axes.
  let cloudMarks = "";
  if (opts.cloud && opts.cloud.length) {
    cloudMarks = opts.cloud.map((p) =>
      `<circle cx="${toX(p[0])}" cy="${toY(p[1])}" r="2.5" class="cloud-dot"/>`).join("");
  }

  // figure markers: dots always (with hover title); labels only for a highlight
  // set (e.g. the nearest few) so 24 names don't collide into an unreadable mass.
  let figMarks = "";
  if (opts.figures && opts.figures.length) {
    figMarks = opts.figures.map((f) => {
      const x = toX(f.v[xKey] || 0), y = toY(f.v[yKey] || 0);
      const showLabel = !labelSet || labelSet.has(f.name);
      const lbl = showLabel ? `<text x="${x + 5}" y="${y - 4}" class="fig-lbl">${escapeHtml(f.name)}</text>` : "";
      return `<g class="fig"><circle cx="${x}" cy="${y}" r="4" class="fig-dot"><title>${escapeHtml(f.name)}</title></circle>${lbl}</g>`;
    }).join("");
  }

  return `
  <svg class="quad-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"
       aria-label="${escapeHtml(ax.label)} vs ${escapeHtml(ay.label)}">
    <rect x="0" y="0" width="${W}" height="${H}" class="quad-bg"/>
    ${tints}
    <line x1="${midX}" y1="${cy}" x2="${midX}" y2="${cy + plot}" class="quad-axis"/>
    <line x1="${cx}" y1="${midY}" x2="${cx + plot}" y2="${midY}" class="quad-axis"/>
    <rect x="${cx}" y="${cy}" width="${plot}" height="${plot}" class="quad-frame"/>
    ${cloudMarks}
    ${archMarks}
    ${figMarks}
    <circle cx="${px}" cy="${py}" r="6" class="you-dot"/>
    <circle cx="${px}" cy="${py}" r="11" class="you-halo"/>
    <!-- pole labels: y+ top-centre, y- bottom-centre, x-/x+ in the bottom corners -->
    <text x="${midX}" y="${cy - 12}" class="pole-lbl top">${escapeHtml(ay.posLabel)}</text>
    <text x="${cx}" y="${cy + plot + 18}" class="pole-lbl xneg">◀ ${escapeHtml(ax.negLabel)}</text>
    <text x="${cx + plot}" y="${cy + plot + 18}" class="pole-lbl xpos">${escapeHtml(ax.posLabel)} ▶</text>
    <text x="${midX}" y="${cy + plot + 38}" class="pole-lbl bot">${escapeHtml(ay.negLabel)}</text>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Single-axis number line: user marker + every archetype's position on ONE axis.
// (No percentage — positions and distances only.) Returns an inline SVG string.
// ---------------------------------------------------------------------------
export function axisLineSVG(userVec, axisKey, archetypes, labelNames) {
  const a = axisByKey(axisKey);
  const W = 460, H = 96, padX = 24, midY = 48;
  const x0 = padX, x1 = W - padX, span = x1 - x0;
  const toX = (v) => x0 + ((v + 100) / 200) * span;
  const u = userVec[axisKey] || 0;
  const labelSet = labelNames ? new Set(labelNames) : null;

  const ticks = archetypes.map((arch, i) => {
    const x = toX(arch.v[axisKey] || 0);
    const show = !labelSet || labelSet.has(arch.name);
    // stagger labels above/below the axis to reduce collision
    const above = i % 2 === 0;
    const ly = above ? midY - 12 : midY + 20;
    const lbl = show ? `<text x="${x}" y="${ly}" class="axl-arch">${escapeHtml(arch.name)}</text>` : "";
    return `<line x1="${x}" y1="${midY - 5}" x2="${x}" y2="${midY + 5}" class="axl-tick"><title>${escapeHtml(arch.name)}: ${arch.v[axisKey]}</title></line>${lbl}`;
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

// Render a quadrant chart into a card element and return that element.
export function quadrantCard(vector, xKey, yKey, opts = {}) {
  const ax = axisByKey(xKey), ay = axisByKey(yKey);
  const card = document.createElement("figure");
  card.className = "chart-card";
  card.innerHTML = quadrantSVG(vector, xKey, yKey, opts) +
    `<figcaption>${escapeHtml(ax.label)} × ${escapeHtml(ay.label)}</figcaption>`;
  return card;
}

// ---------------------------------------------------------------------------
// SVG -> PNG download (canvas). Works entirely client-side.
// ---------------------------------------------------------------------------
export function downloadSvgAsPng(svgEl, filename = "politeion.png", scale = 2) {
  const clone = svgEl.cloneNode(true);
  // Inline computed colors so the rasterised PNG matches the current theme.
  inlineStyles(svgEl, clone);
  const xml = new XMLSerializer().serializeToString(clone);
  const svg64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  const vb = svgEl.viewBox.baseVal;
  const w = (vb && vb.width) || svgEl.clientWidth || 600;
  const h = (vb && vb.height) || svgEl.clientHeight || 600;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    // fill background so transparent areas aren't black
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

// Copy computed presentation styles from source tree onto the clone so the
// serialized SVG is self-contained for rasterisation.
function inlineStyles(srcRoot, cloneRoot) {
  const props = ["fill", "stroke", "stroke-width", "opacity", "fill-opacity",
    "stroke-opacity", "font-size", "font-family", "font-weight", "text-anchor"];
  const srcNodes = srcRoot.querySelectorAll("*");
  const cloneNodes = cloneRoot.querySelectorAll("*");
  const rootStyle = getComputedStyle(srcRoot);
  cloneRoot.setAttribute("style",
    props.map((p) => `${p}:${rootStyle.getPropertyValue(p)}`).join(";"));
  srcNodes.forEach((node, i) => {
    const cs = getComputedStyle(node);
    const decl = props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";");
    if (cloneNodes[i]) cloneNodes[i].setAttribute("style", decl);
  });
}
