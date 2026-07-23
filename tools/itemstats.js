#!/usr/bin/env node
// itemstats.js — read the crowd store and report per-item psychometrics:
// n, mean, sd, and the corrected item-total correlation against the item's
// primary axis. Flags items with r < 0.15 at n >= 100 as pruning candidates.
// Reporting only — never modifies data. Exit 0 unless it can't read inputs.
//
//   node tools/itemstats.js [path/to/results.jsonl]

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const STORE = process.argv[2] || process.env.STORE_FILE || path.join(ROOT, "store", "results.jsonl");
const R_FLAG = 0.15, N_FLAG = 100;

(async () => {
  const { AXIS_KEYS } = await import(pathToFileURL(path.join(ROOT, "js", "axes.js")).href);
  const S = await import(pathToFileURL(path.join(ROOT, "js", "scoring.js")).href);

  const rawQ = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "questions.json"), "utf8"));
  const { questions } = S.validateQuestions(S.migrateQuestions(rawQ).questions);

  // primary axis + weight per scorable item; Σ|w| per axis over full set
  const prim = new Map();
  for (const q of questions) {
    if (q.type === "attention" || !q.axes) continue;
    let best = null;
    for (const k of Object.keys(q.axes)) if (!best || Math.abs(q.axes[k]) > Math.abs(q.axes[best])) best = k;
    if (best) prim.set(q.id, { axis: best, w: q.axes[best], text: q.text });
  }
  const sumAbsW = {};
  for (const k of AXIS_KEYS) sumAbsW[k] = S.maxAttainable(questions, k);

  if (!fs.existsSync(STORE)) { console.log(`no store at ${STORE} — nothing to report yet.`); process.exit(0); }
  const records = [];
  for (const line of fs.readFileSync(STORE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (!Array.isArray(r) && r.items) records.push(r); } catch {}
  }
  console.log(`records with per-item answers: ${records.length}\n`);
  if (!records.length) { console.log("No per-item data yet (older/vector-only records are skipped)."); process.exit(0); }

  const axisIndex = Object.fromEntries(AXIS_KEYS.map((k, i) => [k, i]));
  const flagged = [];
  console.log("id    n     mean    sd     r(corr)  axis        note");
  const ids = [...prim.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const info = prim.get(id);
    const xs = [], ys = [];
    for (const rec of records) {
      const ans = rec.items[id];
      if (ans === undefined) continue;
      const a = (Number(ans) - 50) / 50;
      const oriented = a * Math.sign(info.w);
      const vAxis = rec.v[axisIndex[info.axis]];
      const denom = sumAbsW[info.axis] || 1;
      const corrected = vAxis - 100 * (a * info.w) / denom; // item-total, item removed
      xs.push(oriented); ys.push(corrected);
    }
    const n = xs.length;
    const mean = n ? xs.reduce((s, x) => s + x, 0) / n : 0;
    const sd = n ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / n) : 0;
    const r = pearson(xs, ys);
    const flag = n >= N_FLAG && r < R_FLAG;
    if (flag) flagged.push({ id, n, r, axis: info.axis, text: info.text });
    console.log(`${String(id).padEnd(5)} ${String(n).padStart(4)}  ${fmt(mean)}  ${fmt(sd)}  ${fmt(r)}   ${info.axis.padEnd(10)}  ${flag ? "\x1b[31mPRUNE?\x1b[0m" : ""}`);
  }

  console.log(`\nPruning candidates (r < ${R_FLAG} at n ≥ ${N_FLAG}): ${flagged.length}`);
  for (const f of flagged) console.log(`  id ${f.id} (${f.axis}, r=${f.r.toFixed(2)}, n=${f.n}): ${f.text}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });

function fmt(x) { return (x >= 0 ? " " : "") + x.toFixed(2); }
function pearson(x, y) {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  const d = Math.sqrt(sxx * syy);
  return d === 0 ? 0 : sxy / d;
}
