#!/usr/bin/env node
// audit.js — deploy gate. Loads data/questions.json, reports per-axis health,
// runs the archetype + scoring/validity unit tests, exits nonzero on ANY flag.
//
//   node tools/audit.js
//
// Imports the SAME ES modules the browser uses so audit and app can't drift.

const fs = require("fs");
const os = require("os");
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
  const { matchArchetypes, ARCHETYPES } = await importer("js/archetypes.js");
  const { shuffleWithSeed } = await importer("js/app.js");
  const { leftRightScore } = await importer("js/leftright.js");
  const store = require("../analyzer/store");

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
  // must NOT read as populism — Weak-or-lower AND trailing the top match by ≥10.
  {
    const v = zero(); v.trust_pol = -80; v.dem_fr = 70;
    const ranked = matchArchetypes(v);
    const top = ranked[0];
    const byName = Object.fromEntries(ranked.map((m) => [m.name, m]));
    for (const name of ["National Populist", "Left-Populist"]) {
      const m = byName[name];
      const trail = top.similarity - m.similarity;
      // margin form: must trail the top match by >=10 AND never reach Strong.
      if (m.tier === "Strong") fail(`${name} reached Strong (${m.similarity.toFixed(1)}%) for the distrust+restricted vector.`);
      else if (trail < 10) fail(`${name} @ ${m.similarity.toFixed(1)}% trails top (${top.name} ${top.similarity.toFixed(1)}) by only ${trail.toFixed(1)} pts (need ≥10).`);
      else ok(`${name}: ${m.similarity.toFixed(1)}% (${m.tier}), trails ${top.name} by ${trail.toFixed(1)} pts`);
    }
  }
  // Strong-tier cap: identical to Libertarian except one salient axis off by 45 ->
  // similarity still ≥85 but tier must be capped to Moderate.
  {
    const lib = ARCHETYPES.find((a) => a.name === "Libertarian");
    const v = { ...lib.v }; v.auth_pw = lib.v.auth_pw + 45;
    const m = matchArchetypes(v).find((x) => x.name === "Libertarian");
    if (m.similarity < 85) fail(`strong-cap fixture only ${m.similarity.toFixed(1)}% — cap not exercised.`);
    else if (m.tier !== "Moderate") fail(`strong-cap: ${m.similarity.toFixed(1)}% tier ${m.tier} (expected Moderate — auth_pw off 45 on a salient axis).`);
    else ok(`strong-cap: ${m.similarity.toFixed(1)}% capped to Moderate (salient auth_pw off 45)`);
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

  // Top-up merge safety. A finished run is extended with the questions added
  // since, so an answer may only carry over if ITS ITEM is unchanged — ids get
  // reused across bank edits (398 was an attention check, now a real question)
  // and merging across that would score an answer against the wrong item.
  {
    const bank = [
      { id: 1, text: "a", axes: { mkt: 2 } },
      { id: 2, text: "b", axes: { mkt: -1 } },
      { id: 9, text: "check", type: "attention", expect: 100 },
    ];
    const bad = [];
    const pend = S.pendingQuestions({ 1: 100 }, bank).map((q) => q.id);
    if (JSON.stringify(pend) !== "[2]") bad.push(`pending=${JSON.stringify(pend)} (want [2]; attention never re-asked)`);
    // fingerprinted run: item 2 reworded since -> its answer is dropped, not merged
    const edited = bank.map((q) => (q.id === 2 ? { ...q, text: "b, reworded" } : q));
    const carried = S.reusableAnswers({ answers: { 1: 100, 2: 0 }, itemFp: S.itemFingerprints(bank) }, edited);
    if (carried[1] !== 100 || carried[2] !== undefined) bad.push(`carried=${JSON.stringify(carried)} (want only id 1)`);
    // pre-fingerprint run: the ids the 398-400 edit reused are dropped
    const legacy = S.reusableAnswers({ answers: { 5: 75, 398: 0, 399: 100, 400: 100 } }, edited);
    if (JSON.stringify(legacy) !== '{"5":75}') bad.push(`legacy=${JSON.stringify(legacy)} (want only id 5)`);
    // scoreRun is the single scoring path: it must agree with its parts
    const A = { 1: 100, 2: 0 };
    const run = S.scoreRun(A, bank, { seed: 1 });
    if (run.vector.mkt !== computeScores(A, bank).vector.mkt) bad.push("scoreRun vector differs from computeScores");
    bad.length ? fail("top-up merge: " + bad.join("; "))
      : ok("top-up: pending excludes attention; reused/changed ids dropped, not merged");
  }

  // Order-independence regression: scoring joins by id, never by array index.
  {
    const Q = [
      { id: 1, text: "a", axes: { mkt: 2 } }, { id: 2, text: "b", axes: { mkt: -1, soc: 2 } },
      { id: 3, text: "c", axes: { wel: 2 } }, { id: 4, text: "d", axes: { soc: -2, mkt: 1 } }, { id: 5, text: "e", axes: { env: -2 } },
    ];
    const ans = { 1: 80, 2: 20, 3: 60, 4: 100, 5: 0 };
    const s1 = computeScores(ans, Q).vector;
    const shuffled = shuffleWithSeed(Q.map((q) => q.id), 12345).map((id) => Q.find((q) => q.id === id));
    const s2 = computeScores(ans, shuffled).vector;
    (AXIS_KEYS.every((k) => s1[k] === s2[k]))
      ? ok("scoring is id-based: seed-shuffled order yields identical scores")
      : fail("scoring changed with order — POSITIONAL COUPLING bug.");
  }

  // Length modes: sizes ~target, all axes covered, attention checks always in.
  {
    const quick = questionsForMode(full, "quick"), normal = questionsForMode(full, "normal"), deep = questionsForMode(full, "deep");
    const cov = (set) => AXES.every((a) => itemCount(set, a.key) > 0);
    const attn = questions.filter((q) => q.type === "attention");
    const attnIn = (set) => attn.every((a) => set.some((q) => q.id === a.id));
    // Mode sizes count NUMBERED questions; attention checks ride on top and must
    // never eat into the target (that would silently shorten every mode).
    const numbered = (set) => set.filter((q) => q.type !== "attention").length;
    const numberedFull = numbered(full);
    const bad = [];
    if (Math.abs(numbered(quick) - 100) > 8) bad.push(`quick=${numbered(quick)} numbered`);
    if (Math.abs(numbered(normal) - 250) > 10) bad.push(`normal=${numbered(normal)} numbered`);
    if (numbered(deep) !== numberedFull) bad.push(`deep=${numbered(deep)}≠${numberedFull}`);
    if (!cov(quick)) bad.push("quick misses an axis");
    if (!cov(normal)) bad.push("normal misses an axis");
    if (!attnIn(quick) || !attnIn(normal)) bad.push("a mode dropped attention checks");
    // Anchors set each axis's ceiling — a mode that drops one lets that axis top
    // out on consistency alone, which is the calibration bug they exist to fix.
    const anchors = questions.filter((q) => q.anchor);
    for (const [name, set] of [["quick", quick], ["normal", normal], ["deep", deep]]) {
      if (set.length - numbered(set) !== attn.length) bad.push(`${name} carries ${set.length - numbered(set)} of ${attn.length} attention checks`);
      const missing = anchors.filter((a) => !set.some((q) => q.id === a.id)).map((a) => a.id);
      if (missing.length) bad.push(`${name} drops anchor item(s) ${missing.join(", ")}`);
    }
    bad.length ? fail("mode sampling: " + bad.join("; "))
      : ok(`modes: quick ${numbered(quick)} / normal ${numbered(normal)} / deep ${numbered(deep)} numbered (+${attn.length} unnumbered attention checks each); all axes covered`);
  }

  // ---- precision composite: inverse-variance meta-analysis (the shrinking dot) ----
  {
    const run = (s, sigma, date) => ({ vector: { mkt: s }, precision: sigma == null ? undefined : { mkt: { count: 5, sigma } }, created_at: date });
    const bad = [];

    // (1) two equal-σ runs → simple mean, σ* = sqrt(1/Σ(1/σ²)).
    const iv = S.combineRuns([run(40, 10, "2026-01-01"), run(60, 10, "2026-02-01")]).perAxis.mkt;
    if (!near(iv.score, 50, 0.1) || !near(iv.sigma, 7.07, 0.2) || iv.drifted) bad.push(`inverse-variance: score=${iv.score} σ=${iv.sigma} drifted=${iv.drifted} (want 50 / 7.07 / false)`);

    // (2) σ-floor: a 0.5 band must be floored to 3.0, not allowed to dominate.
    const fl = S.combineRuns([run(50, 0.5, "2026-01-01"), run(50, 10, "2026-02-01")]).perAxis.mkt;
    if (!near(fl.sigma, 2.87, 0.2)) bad.push(`σ-floor: σ=${fl.sigma} (want ≈2.87 floored; unfloored ≈0.5)`);

    // (3) drift guard: conflicting runs → latest epoch wins, axis flagged.
    const dr = S.combineRuns([run(-80, 5, "2026-01-01"), run(80, 5, "2026-06-01")]);
    const dm = dr.perAxis.mkt;
    if (!dm.drifted || !near(dm.score, 80, 0.1) || dm.from !== -80 || dm.to !== 80 || dm.count !== 1) bad.push(`drift: drifted=${dm.drifted} score=${dm.score} from=${dm.from} to=${dm.to} count=${dm.count} (want true / 80 / -80 / 80 / 1)`);

    // (4) legacy run (no precision) → σ=25 and tagged.
    const lg = S.combineRuns([run(50, null, "2026-01-01")]).perAxis.mkt;
    if (!lg.legacy || !near(lg.sigma, 25, 0.1) || !near(lg.score, 50, 0.1)) bad.push(`legacy: legacy=${lg.legacy} σ=${lg.sigma} score=${lg.score} (want true / 25 / 50)`);

    bad.length ? fail("combineRuns: " + bad.join("; "))
      : ok("combineRuns: inverse-variance, σ-floor 3.0, drift epoch, legacy σ=25");
  }

  // ---- analyzer store: time-series bucketing (outlet/writer drift) ----
  {
    // init only to wire AXIS_KEYS + the left–right fn; bucketByMonth is a pure
    // function over hand-built records, so the store's on-disk state is irrelevant.
    store.init(AXIS_KEYS, path.join(os.tmpdir(), "politeion-audit-store.jsonl"), leftRightScore);
    const recs = [
      { ts: "2026-06-03T00:00:00Z", genre: "report", flagged: false, axes: { mkt: { score: 10 } } },
      { ts: "2026-06-10T00:00:00Z", genre: "report", flagged: false, axes: { mkt: { score: 20 } } },
      { ts: "2026-06-20T00:00:00Z", genre: "opinion", flagged: false, axes: { mkt: { score: 60 } } },
      { ts: "2026-07-05T00:00:00Z", genre: "report", flagged: false, axes: { mkt: { score: 0 } } },
      { ts: "2026-07-06T00:00:00Z", genre: "report", flagged: false, axes: { mkt: { score: 0 } } },
    ];
    const bk = store.bucketByMonth(recs);
    const bad = [];
    if (bk.length !== 1) bad.push(`got ${bk.length} buckets (July n=2 must be omitted → expect 1)`);
    const b = bk[0] || {};
    if (b.period !== "2026-06") bad.push(`period ${b.period} (want 2026-06)`);
    if (b.n !== 3) bad.push(`n ${b.n} (want 3)`);
    if (!b.byGenre || b.byGenre.report !== 2 || b.byGenre.opinion !== 1) bad.push(`byGenre ${JSON.stringify(b.byGenre)} (want report 2 / opinion 1)`);
    if (!b.axes || !b.axes.mkt || b.axes.mkt.mean !== 30) bad.push(`mkt mean ${b.axes && b.axes.mkt && b.axes.mkt.mean} (want 30)`);
    if (b.lr !== 30) bad.push(`lr ${b.lr} (want 30 = mean of 10/20/60)`);
    bad.length ? fail("timeSeries bucketing: " + bad.join("; "))
      : ok("timeSeries: n≥3 buckets kept, sparse month omitted, genre-mix + mean + lr correct");
  }

  // ---- Daily Brief: clustering, certification loop, item schema, feed.xml ----
  {
    const { clusterStories } = require("../brief/cluster");
    const { certifyItem } = require("../brief/certify");
    const briefStore = require("../brief/store");
    const bad = [];

    // (1) clustering: a story on >=2 outlets promotes; an outlier stays out.
    const cl = clusterStories([
      { source: "A", title: "Senate passes annual budget bill" },
      { source: "B", title: "Senate approves budget bill after debate" },
      { source: "C", title: "Local weather turns colder this weekend" },
    ]);
    if (cl.selected.length !== 1 || cl.selected[0].outlets.length !== 2) bad.push(`cluster: selected=${cl.selected.length} outlets=${cl.selected[0] && cl.selected[0].outlets.length} (want 1 / 2)`);

    // (2) certification rewrite loop: non-neutral → rewrite → neutral passes.
    let calls = 0;
    const passOnSecond = await certifyItem({ headline: "h" }, {
      certify: async () => (++calls === 1
        ? { id: "a1", stance_detected: true, flags: [], flagged: false, axes: { imm: { score: 34, evidence: "x" } } }
        : { id: "a2", stance_detected: false, flags: [], flagged: false, axes: {} }),
      rewrite: async (it) => ({ ...it, rewritten: true }),
      maxRewrites: 1,
    });
    if (!passOnSecond.certOk || passOnSecond.attempts !== 1 || !passOnSecond.item.rewritten || passOnSecond.analysisId !== "a2") bad.push(`rewrite loop: certOk=${passOnSecond.certOk} attempts=${passOnSecond.attempts} rewritten=${passOnSecond.item.rewritten} (want true/1/true)`);

    // (2b) persistent failure → parked for human edit.
    const parked = await certifyItem({ headline: "h" }, {
      certify: async () => ({ id: "x", stance_detected: true, flags: ["injection_attempt"], flagged: true, axes: {} }),
      rewrite: async (it) => it, maxRewrites: 1,
    });
    if (parked.certOk || !parked.needsHuman) bad.push(`persistent fail: certOk=${parked.certOk} needsHuman=${parked.needsHuman} (want false/true)`);

    // (3) item schema.
    const words = (n) => Array.from({ length: n }, () => "word").join(" ");
    if (!briefStore.validateItem({ headline: "Senate passes budget", summary: words(50), why_it_matters: words(10), links: ["https://example.com/a"] }).ok) bad.push("valid item rejected");
    if (briefStore.validateItem({ headline: "x", summary: words(10), why_it_matters: words(40), links: [] }).ok) bad.push("invalid item accepted");

    // (4) feed.xml well-formedness + escaping.
    const xml = briefStore.feedXml([{ id: "abc", date: "2026-07-24", items: [{ headline: "A & B <ok>" }] }], { origin: "https://politeion.com" });
    const wellFormed = (s) => {
      const body = s.replace(/<\?xml[^?]*\?>/, ""); const stack = []; const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g; let m;
      while ((m = re.exec(body))) { if (m[4] === "/") continue; if (m[1] === "/") { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]); }
      return stack.length === 0;
    };
    if (!xml.startsWith("<?xml")) bad.push("feed: missing xml declaration");
    if (!/<rss version="2\.0">/.test(xml)) bad.push("feed: missing rss 2.0 root");
    if ((xml.match(/<item>/g) || []).length !== 1) bad.push("feed: item count wrong");
    if (!wellFormed(xml)) bad.push("feed: tags not balanced");
    if (/&(?!amp;|lt;|gt;|quot;|#)/.test(xml) || xml.includes("A & B <ok>")) bad.push("feed: text not escaped");

    bad.length ? fail("daily brief: " + bad.join("; "))
      : ok("daily brief: clustering, rewrite→pass / persistent→park, item schema, feed.xml well-formed & escaped");
  }

  // Nation normalization (revised bank).
  {
    let total = itemCount(full, "natl"), primary = 0;
    for (const q of full) { if (q.type === "attention" || !q.axes) continue; let b = null; for (const k of Object.keys(q.axes)) if (!b || Math.abs(q.axes[k]) > Math.abs(q.axes[b])) b = k; if (b === "natl") primary++; }
    ok(`natl coverage: ${primary} primary / ${total} total`);
  }

  // Analyzer calibration: assert stored reference-outlet mkt ordering. Skips
  // cleanly when no reference-outlet analyses exist yet (fresh deploy).
  {
    const { runCalibration } = require("./calibrate");
    const cal = runCalibration();
    if (cal.report.present.length === 0) ok("calibration: no reference-outlet analyses stored yet (skipped)");
    else if (cal.insufficient) ok(`calibration: only ${cal.checked} reference outlet with data (need ≥2; skipped)`);
    else if (cal.ok) ok(`calibration: mkt ordering holds across ${cal.checked} outlets (${cal.report.present.map((o) => o.name + " " + o.meanMkt).join(", ")})`);
    else { for (const v of cal.violations) fail("calibration: " + v); }
  }

  console.log();
  if (FAIL) { console.log("\x1b[31mAUDIT FAILED\x1b[0m"); process.exit(1); }
  console.log("\x1b[32mAUDIT PASSED\x1b[0m");
})().catch((e) => { console.error(e); process.exit(2); });
