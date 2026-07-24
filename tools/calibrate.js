#!/usr/bin/env node
// calibrate.js — economic-axis (mkt) calibration harness. Runs against STORED
// analyses only (no live fetches, no API calls, no tokens). It computes each
// reference outlet's mean `mkt` score from its non-flagged analyses and asserts
// the known relative ordering holds — a sanity check that the rubric + model are
// still calibrated after any rubric/MODEL change.
//
//   node tools/calibrate.js
//
// mkt is +free-market / −state-directed, so the expected ordering (ascending) is
// left-economic outlets first, market-liberal outlets last:
//   Jacobin < The Nation < NYT opinion < WSJ opinion < National Review < Reason
//
// Outlets with no stored data yet are skipped (can't assert). Adjacent inversions
// beyond EPS fail the gate. Exported for use by tools/audit.js (deploy gate).

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ANALYSES_FILE = process.env.ANALYSES_FILE || path.join(ROOT, "store", "analyses.jsonl");
const EPS = 3;           // tolerance: inversions ≤ EPS points are treated as ties
const MIN_N = 1;         // minimum non-flagged analyses for an outlet to be asserted

// Ascending expected mkt order. `domain` is the registrable domain the store keys
// sources by; `name` is for the report.
const EXPECTED = [
  { name: "Jacobin", domain: "jacobin.com" },
  { name: "The Nation", domain: "thenation.com" },
  { name: "NYT opinion", domain: "nytimes.com" },
  { name: "WSJ opinion", domain: "wsj.com" },
  { name: "National Review", domain: "nationalreview.com" },
  { name: "Reason", domain: "reason.com" },
];

function loadAnalyses(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

// Mean mkt per source domain, non-flagged records that actually scored mkt.
function meanMktByDomain(records) {
  const acc = {};
  for (const r of records) {
    if (r.flagged || !r.source || !r.axes || !r.axes.mkt) continue;
    const s = r.axes.mkt.score;
    if (typeof s !== "number") continue;
    (acc[r.source] || (acc[r.source] = [])).push(s);
  }
  const means = {};
  for (const d of Object.keys(acc)) means[d] = { mean: acc[d].reduce((a, b) => a + b, 0) / acc[d].length, n: acc[d].length };
  return means;
}

function runCalibration(opts = {}) {
  const file = opts.file || ANALYSES_FILE;
  const means = meanMktByDomain(loadAnalyses(file));

  const present = EXPECTED
    .map((o) => ({ ...o, ...(means[o.domain] || {}) }))
    .filter((o) => o.n && o.n >= MIN_N);

  const report = { file, present: present.map((o) => ({ name: o.name, domain: o.domain, meanMkt: Math.round(o.mean * 10) / 10, n: o.n })) };

  if (present.length < 2) {
    return { ok: true, insufficient: true, checked: present.length, violations: [], report };
  }

  const violations = [];
  for (let i = 0; i < present.length - 1; i++) {
    const a = present[i], b = present[i + 1];
    // Expected a.mean <= b.mean. A violation is a.mean exceeding b.mean beyond EPS.
    if (a.mean - b.mean > EPS) {
      violations.push(`${a.name} (mkt ${a.mean.toFixed(1)}) should be ≤ ${b.name} (mkt ${b.mean.toFixed(1)})`);
    }
  }
  return { ok: violations.length === 0, insufficient: false, checked: present.length, violations, report };
}

module.exports = { runCalibration, EXPECTED, meanMktByDomain, EPS };

// ---- CLI ----
if (require.main === module) {
  const res = runCalibration();
  console.log(`calibration source: ${res.report.file}`);
  if (!res.report.present.length) {
    console.log("  no reference-outlet analyses stored yet — nothing to calibrate.");
    console.log("\x1b[33mCALIBRATION SKIPPED (no data)\x1b[0m");
    process.exit(0);
  }
  console.log("  mean mkt by outlet (ascending expected order):");
  for (const o of res.report.present) console.log(`    ${o.name.padEnd(18)} ${String(o.meanMkt).padStart(6)}  (n=${o.n})  [${o.domain}]`);
  if (res.insufficient) { console.log("\x1b[33mCALIBRATION SKIPPED (need ≥2 outlets with data)\x1b[0m"); process.exit(0); }
  if (res.ok) { console.log("\x1b[32mCALIBRATION PASSED\x1b[0m — ordering holds within ±" + EPS); process.exit(0); }
  console.log("  \x1b[31mviolations:\x1b[0m");
  for (const v of res.violations) console.log("    " + v);
  console.log("\x1b[31mCALIBRATION FAILED\x1b[0m");
  process.exit(1);
}
