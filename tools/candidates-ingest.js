#!/usr/bin/env node
// candidates-ingest.js — CLI for candidate profiling. Inits the analyzer pipeline +
// the candidate registry, then runs ingestion. Idempotent; respects the budget cap.
//
//   node tools/candidates-ingest.js --dry-run                 # plan + token estimate
//   node tools/candidates-ingest.js --race governor,senate    # Governor + Senate first
//   node tools/candidates-ingest.js --race al-1,al-2,al-3,al-4,al-5,al-6,al-7
//   node tools/candidates-ingest.js --state AL                # all AL races
//   node tools/candidates-ingest.js                           # everything (incl. tracker)

const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");

function argVal(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

(async () => {
  const axes = await import(pathToFileURL(path.join(ROOT, "js", "axes.js")).href);
  const lr = await import(pathToFileURL(path.join(ROOT, "js", "leftright.js")).href);

  const analyzerRoutes = require("../analyzer/routes");
  analyzerRoutes.init(axes.AXIS_KEYS, lr.leftRightScore);   // store + budget + pipeline

  const registry = require("../candidates/registry");
  await registry.init(path.join(ROOT, "data"));

  const { ingest } = require("../candidates/ingest");
  const dryRun = process.argv.includes("--dry-run");
  const filter = {};
  const race = argVal("--race"); if (race) filter.races = new Set(race.split(",").map((s) => s.trim().toLowerCase()));
  const state = argVal("--state"); if (state) filter.state = state;

  try {
    const r = await ingest({ filter: Object.keys(filter).length ? filter : null, dryRun, log: (m) => console.log("[candidates]", m) });
    if (!dryRun) {
      console.log(`\nDone: ${r.run} analyzed, ${r.skipped} skipped, ${r.flagged} flagged, ${r.evidenceFailures} with evidence-verification issues, spend ≈ $${r.spend}${r.budgetHit ? " (BUDGET CAP HIT)" : ""}.`);
      if (r.errors.length) { console.log("Errors:"); for (const e of r.errors) console.log(`  ${e.url}: ${e.error}`); }
    }
    process.exit(0);
  } catch (e) { console.error("ingest failed:", e.message); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(2); });
