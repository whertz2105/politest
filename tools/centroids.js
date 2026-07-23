#!/usr/bin/env node
// centroids.js — read the crowd store and compute the mean 22-axis vector for
// each self-chosen label, for FUTURE archetype recalibration. Reporting only:
// it prints centroids and never modifies js/archetypes.js.
//
//   node tools/centroids.js [path/to/results.jsonl]

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const STORE = process.argv[2] || process.env.STORE_FILE || path.join(ROOT, "store", "results.jsonl");

(async () => {
  const { AXIS_KEYS } = await import(pathToFileURL(path.join(ROOT, "js", "axes.js")).href);
  if (!fs.existsSync(STORE)) { console.log(`no store at ${STORE} — nothing to report yet.`); process.exit(0); }

  const byLabel = new Map();
  for (const line of fs.readFileSync(STORE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (Array.isArray(r) || !r.v || !r.label || r.label === "none") continue;
    if (!byLabel.has(r.label)) byLabel.set(r.label, []);
    byLabel.get(r.label).push(r.v);
  }

  if (!byLabel.size) { console.log("No labelled records yet."); process.exit(0); }
  const labels = [...byLabel.keys()].sort((a, b) => byLabel.get(b).length - byLabel.get(a).length);
  console.log(`Self-labelled centroids (${labels.length} labels):\n`);
  for (const label of labels) {
    const rows = byLabel.get(label), n = rows.length;
    const mean = AXIS_KEYS.map((_, i) => Math.round(rows.reduce((s, v) => s + (v[i] || 0), 0) / n));
    console.log(`## ${label}  (n=${n})`);
    console.log("   " + AXIS_KEYS.map((k, i) => `${k}:${mean[i]}`).join("  "));
    console.log();
  }
  console.log("Reporting only — js/archetypes.js is NOT modified. Use these to hand-tune archetypes when n is large enough.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
