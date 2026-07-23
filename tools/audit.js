#!/usr/bin/env node
// audit.js — deploy gate. Loads data/questions.json, reports per-axis health,
// runs the archetype unit tests, and exits nonzero on ANY flag so CI can block.
//
//   node tools/audit.js
//
// It imports the SAME ES modules the browser uses (js/axes, js/scoring,
// js/archetypes) so the audit and the app can never drift.

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const importer = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let FAIL = false;
const fail = (msg) => { FAIL = true; console.log("  \x1b[31mFLAG\x1b[0m " + msg); };
const ok = (msg) => console.log("  \x1b[32mok\x1b[0m   " + msg);

(async () => {
  const { AXES, AXIS_KEYS } = await importer("js/axes.js");
  const { validateQuestions, questionsForMode, maxAttainable, itemCount } = await importer("js/scoring.js");
  const { ARCHETYPES, matchArchetypes, similarity, tierFor } = await importer("js/archetypes.js");

  // ---- load questions.json ----
  const qpath = path.join(ROOT, "data", "questions.json");
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(qpath, "utf8"));
  } catch (e) {
    console.log(`\x1b[31mCannot read/parse data/questions.json:\x1b[0m ${e.message}`);
    process.exit(2);
  }

  console.log("=== questions.json validation ===");
  const { questions, errors, warnings } = validateQuestions(raw);
  if (errors.length) { errors.forEach((e) => fail(e)); }
  else ok(`${questions.length} valid questions, ${warnings.length} warnings`);

  // ---- per-axis report ----
  console.log("\n=== per-axis report (full set) ===");
  console.log("axis   items   +keyed  -keyed  bal%   max   xload  core");
  const full = questions;
  const core = questionsForMode(questions, "quick");
  for (const a of AXES) {
    let pos = 0, neg = 0, xload = 0;
    for (const q of full) {
      const w = q.axes[a.key];
      if (typeof w === "number" && w !== 0) {
        (w > 0 ? pos++ : neg++);
        if (Object.keys(q.axes).length > 1) xload++;
      }
    }
    const n = pos + neg;
    const bal = n ? Math.round((Math.max(pos, neg) / n) * 100) : 0;
    const max = maxAttainable(full, a.key);
    const coreN = itemCount(core, a.key);
    const line = `${a.key.padEnd(6)} ${String(n).padStart(5)}  ${String(pos).padStart(6)}  ${String(neg).padStart(6)}  ${String(bal).padStart(4)}  ${String(max).padStart(4)}  ${String(xload).padStart(5)}  ${String(coreN).padStart(4)}`;
    console.log("  " + line);
    if (n < 12) fail(`axis "${a.key}" has ${n} items (<12).`);
    if (n && bal > 65) fail(`axis "${a.key}" keying imbalance ${bal}% (worse than 65/35).`);
  }
  // core-mode coverage (quick mode must be usable)
  console.log(`\n  core subset size: ${core.length}`);
  for (const a of AXES) {
    if (core.length && itemCount(core, a.key) === 0)
      fail(`core subset has 0 items for axis "${a.key}" (quick mode would divide by zero).`);
  }

  // ---- archetype unit tests ----
  console.log("\n=== archetype tests ===");
  const zero = () => Object.fromEntries(AXIS_KEYS.map((k) => [k, 0]));

  // (REQUIRED) The failure mode this whole design exists to prevent:
  // distrust of institutions + RESTRICTED governance must NOT be read as populism.
  {
    const v = zero(); v.trust = -80; v.dem = 70;
    const matches = matchArchetypes(v);
    const byName = Object.fromEntries(matches.map((m) => [m.name, m]));
    for (const name of ["National Populist", "Left-Populist"]) {
      const m = byName[name];
      const aboveWeak = m.similarity >= 70; // Strong or Moderate
      if (aboveWeak) fail(`{trust:-80, dem:+70} matches ${name} at ${m.similarity.toFixed(1)}% (${m.tier}) — must be Weak or lower.`);
      else ok(`${name}: ${m.similarity.toFixed(1)}% (${m.tier}) — correctly not a populist match`);
    }
  }

  // (SANITY) A textbook libertarian vector should land on Libertarian, Strong-ish.
  {
    const v = zero();
    Object.assign(v, { mkt: 85, wel: 75, auth: -90, sec: -80, spe: -80, fp: -55, tech: 45 });
    const top = matchArchetypes(v)[0];
    if (top.name !== "Libertarian" || top.similarity < 70)
      fail(`libertarian fixture -> top "${top.name}" @ ${top.similarity.toFixed(1)}% (expected Libertarian, >=70).`);
    else ok(`libertarian fixture -> ${top.name} @ ${top.similarity.toFixed(1)}%`);
  }

  // (SANITY) An all-neutral vector's closest archetype should be the Centrist.
  {
    const top = matchArchetypes(zero())[0];
    if (top.name !== "Centrist")
      fail(`neutral vector -> top "${top.name}" @ ${top.similarity.toFixed(1)}% (expected Centrist).`);
    else ok(`neutral vector -> ${top.name} @ ${top.similarity.toFixed(1)}% (${top.tier})`);
  }

  // (SANITY) A textbook national-populist vector SHOULD match National Populist
  // strongly, and must not be out-ranked by Left-Populist (the mirror failure).
  {
    const v = zero();
    Object.assign(v, { natl: 85, imm: 82, trust: -70, dem: -65, trd: 62, soc: 55, auth: 40 });
    const m = matchArchetypes(v);
    const np = m.find((x) => x.name === "National Populist");
    const lp = m.find((x) => x.name === "Left-Populist");
    if (np.similarity < 80) fail(`national-populist fixture -> National Populist only ${np.similarity.toFixed(1)}% (expected >=80).`);
    else if (lp.similarity >= np.similarity) fail(`national-populist fixture -> Left-Populist (${lp.similarity.toFixed(1)}%) >= National Populist (${np.similarity.toFixed(1)}%).`);
    else ok(`national-populist fixture -> National Populist ${np.similarity.toFixed(1)}% > Left-Populist ${lp.similarity.toFixed(1)}%`);
  }

  console.log();
  if (FAIL) { console.log("\x1b[31mAUDIT FAILED\x1b[0m"); process.exit(1); }
  console.log("\x1b[32mAUDIT PASSED\x1b[0m");
})().catch((e) => { console.error(e); process.exit(2); });
