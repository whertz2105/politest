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
    const scoreHtml = spansZero
      ? `<span class="bar-score leans" title="confidence band spans zero — sign uncertain">leans ${escapeHtml(score >= 0 ? a.posLabel : a.negLabel)} <span class="muted">(${sign(score)})</span></span>`
      : `<span class="bar-score ${dir}">${sign(score)}</span>`;
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
  const pad = 54; // room for pole labels
  const plot = size; // inner plot square side
  const W = plot + pad * 2;
  const H = plot + pad * 2;
  const ax = axisByKey(xKey), ay = axisByKey(yKey);
  const cx = pad, cy = pad;

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

  // labeled figure markers (historical figures).
  let figMarks = "";
  if (opts.figures && opts.figures.length) {
    figMarks = opts.figures.map((f) => {
      const x = toX(f.v[xKey] || 0), y = toY(f.v[yKey] || 0);
      return `<g class="fig"><circle cx="${x}" cy="${y}" r="4" class="fig-dot"><title>${escapeHtml(f.name)}</title></circle>` +
        `<text x="${x + 6}" y="${y - 4}" class="fig-lbl">${escapeHtml(f.name)}</text></g>`;
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
    <!-- pole labels -->
    <text x="${midX}" y="${cy - 14}" class="pole-lbl top">${escapeHtml(ay.posLabel)}</text>
    <text x="${midX}" y="${cy + plot + 26}" class="pole-lbl bot">${escapeHtml(ay.negLabel)}</text>
    <text x="${cx - 8}" y="${midY}" class="pole-lbl left">${escapeHtml(ax.negLabel)}</text>
    <text x="${cx + plot + 8}" y="${midY}" class="pole-lbl right">${escapeHtml(ax.posLabel)}</text>
    <text x="${cx + 4}" y="${cy + plot + 42}" class="axis-name">${escapeHtml(ax.label)} ↔</text>
    <text x="${cx + 4}" y="${cy - 34}" class="axis-name">${escapeHtml(ay.label)} ↕</text>
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
export function downloadSvgAsPng(svgEl, filename = "decacompass.png", scale = 2) {
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
