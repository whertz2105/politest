// charts2d.js — inline-SVG 2D visualisations. No external deps.
import { AXES, axisByKey } from "./axes.js";
import { escapeHtml } from "./app.js";

// ---------------------------------------------------------------------------
// 18-row horizontal bar readout (built as accessible HTML + inline SVG bars).
// ---------------------------------------------------------------------------
export function renderBarReadout(container, vector, counts) {
  const rows = AXES.map((a) => {
    const score = Math.round(vector[a.key] || 0);
    const n = counts ? counts[a.key] : undefined;
    // position: center is 0; -100..100 -> 0..100%
    const pct = (score + 100) / 2; // 0..100
    const from = Math.min(50, pct);
    const width = Math.abs(pct - 50);
    const dir = score >= 0 ? "pos" : "neg";
    return `
      <div class="bar-row">
        <div class="bar-head">
          <span class="bar-axis">${escapeHtml(a.label)}</span>
          ${n !== undefined ? `<span class="bar-count" title="items loading this axis">${n} item${n === 1 ? "" : "s"}</span>` : ""}
          <span class="bar-score ${dir}">${score > 0 ? "+" : ""}${score}</span>
        </div>
        <div class="bar-track" role="img" aria-label="${escapeHtml(a.label)}: ${score}, ${score >= 0 ? escapeHtml(a.posLabel) : escapeHtml(a.negLabel)}">
          <span class="pole neg">${escapeHtml(a.negLabel)}</span>
          <svg class="bar-svg" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
            <line x1="50" y1="0" x2="50" y2="12" class="bar-mid"/>
            <rect x="${from}" y="2" width="${width}" height="8" rx="1" class="bar-fill ${dir}"/>
          </svg>
          <span class="pole pos">${escapeHtml(a.posLabel)}</span>
        </div>
      </div>`;
  }).join("");
  container.innerHTML = `<div class="bar-readout">${rows}</div>`;
}

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

  return `
  <svg class="quad-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"
       aria-label="${escapeHtml(ax.label)} vs ${escapeHtml(ay.label)}">
    <rect x="0" y="0" width="${W}" height="${H}" class="quad-bg"/>
    ${tints}
    <line x1="${midX}" y1="${cy}" x2="${midX}" y2="${cy + plot}" class="quad-axis"/>
    <line x1="${cx}" y1="${midY}" x2="${cx + plot}" y2="${midY}" class="quad-axis"/>
    <rect x="${cx}" y="${cy}" width="${plot}" height="${plot}" class="quad-frame"/>
    ${archMarks}
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
