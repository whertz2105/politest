// app.js — shared shell used by every page. Deliberately free of any 3D / Three.js
// import so the core flow (test, results) stays dependency-free.
import { APP_NAME, AXIS_KEYS } from "./axes.js";
import { validateQuestions, migrateQuestions } from "./scoring.js";

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
const THEME_KEY = "dc_theme";

export function applyStoredTheme() {
  let t;
  try { t = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  if (t !== "light" && t !== "dark") t = "dark"; // dark-mode default
  document.documentElement.setAttribute("data-theme", t);
  return t;
}

export function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  const next = cur === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  return next;
}

// ---------------------------------------------------------------------------
// Shared header / nav
// ---------------------------------------------------------------------------
const NAV = [
  { href: "index.html", label: "Home" },
  { href: "test.html", label: "Test" },
  { href: "results.html", label: "Results" },
  { href: "explore3d.html", label: "3D" },
  { href: "analyze.html", label: "Analyze" },
  { href: "candidates.html", label: "Candidates" },
  { href: "brief.html", label: "Brief" },
  { href: "data.html", label: "Data" },
  { href: "account.html", label: "Account" },
];

// Build the site header into <div data-shell></div> (if present) and wire theme toggle.
// Compass roundel favicon (inline SVG, dependency-free) — navy disc, brass cross.
function ensureFavicon() {
  if (document.querySelector('link[rel="icon"]')) return;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<circle cx="16" cy="16" r="15" fill="#1e3a5f"/>' +
    '<g stroke="#cba43f" stroke-width="2" stroke-linecap="round"><line x1="16" y1="5" x2="16" y2="27"/><line x1="5" y1="16" x2="27" y2="16"/></g>' +
    '<circle cx="16" cy="16" r="3" fill="#cba43f"/></svg>';
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = "data:image/svg+xml," + encodeURIComponent(svg);
  document.head.appendChild(link);
}

export function initShell(activeHref) {
  applyStoredTheme();
  ensureFavicon();
  const mount = document.querySelector("[data-shell]");
  if (!mount) return;
  const links = NAV.map((n) => {
    const active = n.href === activeHref ? ' aria-current="page"' : "";
    return `<a href="${n.href}"${active}>${n.label}</a>`;
  }).join("");
  mount.innerHTML = `
    <header class="site-header">
      <a class="brand" href="index.html">${escapeHtml(APP_NAME)}</a>
      <nav class="site-nav">${links}</nav>
      <button class="theme-toggle" type="button" aria-label="Toggle light/dark theme" title="Toggle theme">◐</button>
    </header>`;
  const btn = mount.querySelector(".theme-toggle");
  if (btn) btn.addEventListener("click", toggleTheme);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
let _cache = null;
export async function loadQuestionData() {
  if (_cache) return _cache;
  const res = await fetch("data/questions.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load questions.json (HTTP ${res.status})`);
  let raw;
  try {
    raw = await res.json();
  } catch (e) {
    throw new Error("questions.json is not valid JSON: " + e.message);
  }
  // Migrate legacy fused axis keys (auth/dem/trust/meth) BEFORE validating, so a
  // v1 bank loads cleanly against the 22-axis system.
  const mig = migrateQuestions(raw);
  const { questions, errors, warnings } = validateQuestions(mig.questions);
  _cache = { raw, questions, errors, warnings, bankVersion: mig.bankVersion, approximatedAxes: mig.approximatedAxes };
  return _cache;
}

// ---------------------------------------------------------------------------
// Seeded shuffle (mulberry32 + Fisher–Yates) — stable across refresh for a seed.
// ---------------------------------------------------------------------------
export function makeSeed() {
  // 32-bit seed. crypto if available, else time is unavailable in some sandboxes
  // so fall back to a fixed-but-nondegenerate value combined with performance.now.
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] >>> 0;
  }
  return (Math.floor((performance.now() * 1000) % 4294967296)) >>> 0 || 0x9e3779b9;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed(array, seed) {
  const out = array.slice();
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Test progress persistence
// ---------------------------------------------------------------------------
// Bumped to v2: unified 0..100 answer format + stored answer mode. The legacy key
// is read once for migration (see test.html) then discarded.
export const PROGRESS_KEY = "dc_progress_v2";
export const PROGRESS_KEY_LEGACY = "dc_progress_v1";

export function saveProgress(state) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}
export function loadProgress() {
  try {
    const s = localStorage.getItem(PROGRESS_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}
export function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Shareable results codec: version byte + N signed score bytes -> base64url.
// Order/length is AXIS_KEYS (fixed by axes.js). v2 = 22 axes (was 18); old v1
// links no longer decode (version + length guard), never silently misread.
// ---------------------------------------------------------------------------
export const ENCODE_VERSION = 2;

export function encodeVector(vector) {
  const bytes = new Uint8Array(1 + AXIS_KEYS.length);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, ENCODE_VERSION);
  AXIS_KEYS.forEach((k, i) => {
    let v = Math.round(Number(vector[k]) || 0);
    v = v < -100 ? -100 : v > 100 ? 100 : v;
    view.setInt8(1 + i, v);
  });
  return bytesToB64url(bytes);
}

export function decodeVector(str) {
  let bytes;
  try {
    bytes = b64urlToBytes(str);
  } catch {
    return null;
  }
  if (!bytes || bytes.length < 1) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  if (version !== ENCODE_VERSION) return null;
  if (bytes.length !== 1 + AXIS_KEYS.length) return null;
  const vector = {};
  AXIS_KEYS.forEach((k, i) => {
    vector[k] = view.getInt8(1 + i);
  });
  return { version, vector };
}

function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Read the results vector from location.hash (#r=...). Returns vector or null.
// If the page has no result loaded (no #r= hash and no local cached result) but
// the signed-in user has saved results, load their most recent one into the hash.
// Returns true if it set the hash. Enables Results/3D to auto-populate from the
// account on a fresh browser/device.
export async function loadAccountResultIntoHash() {
  if (/[#&]r=/.test(location.hash)) return false;
  try { const l = JSON.parse(localStorage.getItem("dc_last_result") || "null"); if (l && l.vector) return false; } catch { /* ignore */ }
  try {
    const res = await fetch("/api/auth/results", { cache: "no-cache" });
    if (!res.ok) return false; // 401 (signed out) or accounts unavailable
    const list = (await res.json()).results || [];
    if (!list.length) return false;
    history.replaceState(null, "", "#r=" + encodeURIComponent(list[0].enc));
    return true;
  } catch { return false; }
}

export function vectorFromHash() {
  const m = /[#&]r=([^&]+)/.exec(location.hash || "");
  if (!m) return null;
  const decoded = decodeVector(decodeURIComponent(m[1]));
  return decoded ? decoded.vector : null;
}
