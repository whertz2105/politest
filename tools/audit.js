#!/usr/bin/env node
// audit.js — deploy gate. Loads data/questions.json, reports per-axis health,
// runs the archetype + scoring/validity unit tests, exits nonzero on ANY flag.
//
//   node tools/audit.js
//
// Imports the SAME ES modules the browser uses so audit and app can't drift.

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const importer = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let FAIL = false;
const fail = (msg) => { FAIL = true; console.log("  \x1b[31mFLAG\x1b[0m " + msg); };
const ok = (msg) => console.log("  \x1b[32mok\x1b[0m   " + msg);
const near = (a, b, eps = 0.06) => Math.abs(a - b) <= eps;

(async () => {
  const { AXES, AXIS_KEYS, LEGACY_AXIS_MAP } = await importer("js/axes.js");
  const S = await importer("js/scoring.js");
  const { validateQuestions, migrateQuestions, questionsForMode, maxAttainable, itemCount,
          computeScores, computeAttention, computeConsistency, bootstrapConfidence,
          CLASSIC_MAP } = S;
  const { matchArchetypes } = await importer("js/archetypes.js");

  // ---- load + migrate questions.json ----
  const qpath = path.join(ROOT, "data", "questions.json");
  let raw;
  try { raw = JSON.parse(fs.readFileSync(qpath, "utf8")); }
  catch (e) { console.log(`\x1b[31mCannot read/parse data/questions.json:\x1b[0m ${e.message}`); process.exit(2); }

  console.log("=== questions.json validation ===");
  const mig = migrateQuestions(raw);
  console.log(`  bank version: v${mig.bankVersion}` + (mig.approximatedAxes.length ? ` (split axes approximated: ${mig.approximatedAxes.join(", ")})` : ""));
  const { questions, errors, warnings } = validateQuestions(mig.questions);
  if (errors.length) errors.forEach((e) => fail(e));
  else ok(`${questions.length} valid questions, ${warnings.length} warnings`);

  // ---- per-axis report ----
  console.log("\n=== per-axis report (full set) ===");
  console.log("axis          items  +key  -key  bal%   max  xload  core  sev");
  const full = questions;
  const core = questionsForMode(questions, "quick");
  const hasSev = full.some((q) => q.sev !== undefined);
  for (const a of AXES) {
    let pos = 0, neg = 0, xload = 0, sevCov = 0;
    for (const q of full) {
      if (q.type === "attention" || !q.axes) continue;
      const w = q.axes[a.key];
      if (typeof w === "number" && w !== 0) {
        (w > 0 ? pos++ : neg++);
        if (Object.keys(q.axes).length > 1) xload++;
        if (q.sev !== undefined) sevCov++;
      }
    }
    const n = pos + neg;
    const bal = n ? Math.round((Math.max(pos, neg) / n) * 100) : 0;
    const max = maxAttainable(full, a.key);
    const coreN = itemCount(core, a.key);
    console.log("  " + `${a.key.padEnd(12)} ${String(n).padStart(4)}  ${String(pos).padStart(4)}  ${String(neg).padStart(4)}  ${String(bal).padStart(4)}  ${String(max).padStart(4)}  ${String(xload).padStart(5)}  ${String(coreN).padStart(4)}  ${hasSev ? String(sevCov).padStart(3) : "  -"}`);
    if (n === 0) { console.log(`       \x1b[33m… awaiting items (bank v${mig.bankVersion})\x1b[0m`); continue; }
    if (n < 12) fail(`axis "${a.key}" has ${n} items (<12).`);
    if (bal > 65) fail(`axis "${a.key}" keying imbalance ${bal}% (worse than 65/35).`);
    if (core.length && coreN === 0) fail(`axis "${a.key}" has items but 0 in the core subset.`);
  }
  console.log(`\n  core subset size: ${core.length}`);

  // ---- archetype tests ----
  console.log("\n=== archetype tests ===");
  const zero = () => Object.fromEntries(AXIS_KEYS.map((k) => [k, 0]));

  // (REQUIRED, split-axis) distrust of the political class + RESTRICTED franchise
  // must NOT read as populism.
  {
    const v = zero(); v.trust_pol = -80; v.dem_fr = 70;
    const byName = Object.fromEntries(matchArchetypes(v).map((m) => [m.name, m]));
    for (const name of ["National Populist", "Left-Populist"]) {
      const m = byName[name];
      if (m.similarity >= 70) fail(`{trust_pol:-80, dem_fr:+70} matches ${name} at ${m.similarity.toFixed(1)}% (${m.tier}) — must be Weak or lower.`);
      else ok(`${name}: ${m.similarity.toFixed(1)}% (${m.tier}) — correctly not a populist match`);
    }
  }
  {
    const v = zero();
    Object.assign(v, { mkt: 85, wel: 75, auth_pw: -90, sec: -80, spe: -80, fp: -55, tech: 45 });
    const top = matchArchetypes(v)[0];
    if (top.name !== "Libertarian" || top.similarity < 70) fail(`libertarian fixture -> "${top.name}" @ ${top.similarity.toFixed(1)}% (expected Libertarian >=70).`);
    else ok(`libertarian fixture -> ${top.name} @ ${top.similarity.toFixed(1)}%`);
  }
  {
    const top = matchArchetypes(zero())[0];
    if (top.name !== "Centrist") fail(`neutral vector -> "${top.name}" (expected Centrist).`);
    else ok(`neutral vector -> ${top.name} @ ${top.similarity.toFixed(1)}% (${top.tier})`);
  }
  {
    const v = zero();
    Object.assign(v, { natl: 85, imm: 82, trust_pol: -70, dem_fr: -65, trd: 62, soc: 55, auth_pw: 40 });
    const m = matchArchetypes(v);
    const np = m.find((x) => x.name === "National Populist"), lp = m.find((x) => x.name === "Left-Populist");
    if (np.similarity < 80) fail(`national-populist fixture -> only ${np.similarity.toFixed(1)}% (expected >=80).`);
    else if (lp.similarity >= np.similarity) fail(`national-populist fixture -> Left-Populist (${lp.similarity.toFixed(1)}) >= National Populist (${np.similarity.toFixed(1)}).`);
    else ok(`national-populist fixture -> National Populist ${np.similarity.toFixed(1)}% > Left-Populist ${lp.similarity.toFixed(1)}%`);
  }

  // ---- scoring / validity tests ----
  console.log("\n=== scoring & validity tests ===");

  // Slider path on a synthetic set with a mixed-keying axis (mkt: +2 and -1).
  {
    const Q = [
      { id: 1, text: "a", axes: { mkt: 2 } },
      { id: 2, text: "b", axes: { mkt: -1 } },
      { id: 3, text: "c", axes: { wel: 2, soc: -2 } },
    ];
    const setAll = (val) => Object.fromEntries(Q.map((q) => [q.id, val]));
    const s50 = computeScores(setAll(50), Q).vector;
    if (AXIS_KEYS.every((k) => s50[k] === 0)) ok("all-50 -> every axis exactly 0.0");
    else fail(`all-50 produced nonzero axes: ${AXIS_KEYS.filter((k) => s50[k] !== 0).map((k) => `${k}=${s50[k]}`).join(", ")}`);

    const s100 = computeScores(setAll(100), Q).vector;
    // signature: mkt = 100*(2-1)/(2+1) = 33.3 (NOT ±100); wel=+100; soc=-100
    if (near(s100.mkt, 33.3) && s100.wel === 100 && s100.soc === -100) ok(`all-100 -> keying signature (mkt=${s100.mkt}, wel=100, soc=-100)`);
    else fail(`all-100 signature wrong: mkt=${s100.mkt} (want 33.3), wel=${s100.wel}, soc=${s100.soc}`);
    if (s100.mkt === 100 || s100.mkt === -100) fail("all-100 mkt hit ±100 despite mixed keying.");

    const s0 = computeScores(setAll(0), Q).vector;
    if (near(s0.mkt, -33.3) && s0.wel === -100 && s0.soc === 100) ok("all-0 -> exact negation of all-100 signature");
    else fail(`all-0 wrong: mkt=${s0.mkt}, wel=${s0.wel}, soc=${s0.soc}`);
  }

  // Classic-mode mapping
  {
    const okMap = CLASSIC_MAP["Strongly Disagree"] === 0 && CLASSIC_MAP["Disagree"] === 25 &&
      CLASSIC_MAP["Neutral"] === 50 && CLASSIC_MAP["Agree"] === 75 && CLASSIC_MAP["Strongly Agree"] === 100;
    okMap ? ok("classic SD/D/N/A/SA -> 0/25/50/75/100") : fail(`classic map wrong: ${JSON.stringify(CLASSIC_MAP)}`);
  }

  // Legacy-key mapping
  {
    const v1 = [{ id: 1, text: "t", axes: { auth: 2, dem: -1, trust: 1, meth: 2 } }];
    const r = migrateQuestions(v1);
    const ax = r.questions[0].axes;
    const good = ax.auth_pw === 2 && ax.dem_fr === -1 && ax.trust_pol === 1 && ax.meth_scope === 2 &&
      r.bankVersion === 1 && ["auth_pw", "dem_fr", "trust_pol", "meth_scope"].every((k) => r.approximatedAxes.includes(k));
    good ? ok("legacy auth/dem/trust/meth -> auth_pw/dem_fr/trust_pol/meth_scope (bank v1)") : fail(`legacy mapping wrong: ${JSON.stringify(ax)} bank=${r.bankVersion}`);
  }

  // Consistency-pair scorer
  {
    const QP = [
      { id: 20, text: "p", axes: { mkt: 2 }, pair: "P1" },
      { id: 21, text: "q", axes: { mkt: -2 }, pair: "P1" },
    ];
    const good = computeConsistency({ 20: 80, 21: 20 }, QP);  // |80-(100-20)|=0
    const bad = computeConsistency({ 20: 80, 21: 80 }, QP);   // |80-20|=60
    if (good.overallPct === 100 && good.axisWarn.mkt === false && bad.overallPct === 40 && bad.axisWarn.mkt === true)
      ok(`consistency pairs: aligned=100% (no warn), conflicting=40% (warn)`);
    else fail(`consistency scorer wrong: good=${good.overallPct}/${good.axisWarn.mkt} bad=${bad.overallPct}/${bad.axisWarn.mkt}`);
  }

  // Bootstrap determinism (same seed -> identical bands)
  {
    const Q = [{ id: 1, text: "a", axes: { mkt: 2 } }, { id: 2, text: "b", axes: { mkt: -1 } }, { id: 3, text: "c", axes: { mkt: 1 } }];
    const ans = { 1: 90, 2: 20, 3: 70 };
    const b1 = bootstrapConfidence(ans, Q, { seed: 42, iters: 200 });
    const b2 = bootstrapConfidence(ans, Q, { seed: 42, iters: 200 });
    if (JSON.stringify(b1) === JSON.stringify(b2)) ok(`bootstrap deterministic under fixed seed (mkt band [${b1.lo.mkt}, ${b1.hi.mkt}])`);
    else fail("bootstrap not deterministic under a fixed seed.");
  }

  // Attention-item exclusion
  {
    const Q = [{ id: 10, text: "For this item, completely agree.", type: "attention", expect: 100 }, { id: 11, text: "x", axes: { mkt: 2 } }];
    const sc = computeScores({ 10: 0, 11: 100 }, Q).vector;   // attention answer must not affect mkt
    const att1 = computeAttention({ 10: 0, 11: 100 }, Q);
    const Q2 = [{ id: 10, type: "attention", expect: 100 }, { id: 12, type: "attention", expect: 0 }];
    const att2 = computeAttention({ 10: 0, 12: 100 }, Q2);    // both fail
    if (sc.mkt === 100 && att1.failures === 1 && att1.failed === false && att2.failures === 2 && att2.failed === true)
      ok("attention items excluded from scoring; ≥2 failures flags the session");
    else fail(`attention test wrong: mkt=${sc.mkt}, att1=${att1.failures}/${att1.failed}, att2=${att2.failures}/${att2.failed}`);
  }

  console.log();
  if (FAIL) { console.log("\x1b[31mAUDIT FAILED\x1b[0m"); process.exit(1); }
  console.log("\x1b[32mAUDIT PASSED\x1b[0m");
})().catch((e) => { console.error(e); process.exit(2); });
