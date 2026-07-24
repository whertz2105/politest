// ingest.js (candidates) — admin-triggered profiling. For each candidate source URL
// it runs the EXISTING analyzer pipeline, tagged kind/origin "candidate" +
// candidateId. Idempotent: a URL already candidate-analyzed for that candidate is
// skipped (no tokens). --dry-run prints the fetch/queue plan with a rough token/cost
// estimate. The monthly budget gate is respected (a hit cap stops the run cleanly).
//
// Reuses analyze.submit with force:true so a pre-existing PUBLIC scan of the same URL
// (origin null) never shadows the candidate-tagged analysis — our own dedupe
// (store.hasCandidateAnalysis) prevents re-spending on already-ingested candidate URLs.

const analyze = require("../analyzer/analyze");
const store = require("../analyzer/store");
const budget = require("../analyzer/budget");
const provider = require("../analyzer/provider");
const registry = require("./registry");

// Rough per-URL estimate for the dry-run only (real usage depends on article length).
const EST_INPUT = 9000, EST_OUTPUT = 600;

function buildPlan(filter) {
  const cands = registry.candidatesForIngest(filter);
  const plan = []; let skipped = 0;
  for (const c of cands) {
    for (const url of c.sources) {
      if (store.hasCandidateAnalysis(url, c.id)) { skipped++; continue; }
      plan.push({ candidateId: c.id, name: c.name, race: c.race ? c.race.key : "tracker", url });
    }
  }
  return { plan, skipped };
}

async function ingest({ filter, dryRun, log = () => {} } = {}) {
  const model = provider.config().model;
  const { plan, skipped } = buildPlan(filter);

  if (dryRun) {
    const estCost = budget.estimateCost({ input: EST_INPUT * plan.length, output: EST_OUTPUT * plan.length }, model);
    log(`DRY RUN — ${plan.length} URL(s) to analyze; ${skipped} already done (skipped).`);
    for (const p of plan) log(`  ${p.race} · ${p.name} · ${p.url}`);
    log(`Estimated ≈ ${(EST_INPUT + EST_OUTPUT) * plan.length} tokens, ≈ $${estCost.toFixed(2)} at model ${model || "(unset)"} — rough; actual depends on article length.`);
    return { dryRun: true, toRun: plan.length, skipped, plan, estCost: Math.round(estCost * 10000) / 10000 };
  }

  const spentStart = budget.monthStats().costUsd;
  const result = { run: 0, skipped, flagged: 0, evidenceFailures: 0, errors: [], budgetHit: false };
  for (const p of plan) {
    if (budget.overBudget()) { result.budgetHit = true; log("budget cap reached — stopping"); break; }
    try {
      const out = await analyze.submit({ ip: "candidate", url: p.url, admin: true, force: true, kind: "candidate", origin: "candidate", candidateId: p.candidateId });
      result.run++;
      const rec = store.getById(out.id);
      if (rec && rec.flagged) result.flagged++;
      if (rec && Object.keys(rec.axes || {}).some((k) => rec.axes[k].evidenceOk === false)) result.evidenceFailures++;
      log(`  ✓ ${p.name} · ${p.url}${rec && rec.flagged ? " [flagged]" : ""}`);
    } catch (e) {
      if (e.code === "budget") { result.budgetHit = true; log("budget cap reached — stopping"); break; }
      result.errors.push({ url: p.url, error: e.message });
      log(`  ✗ ${p.url}: ${e.message}`);
    }
  }
  result.spend = Math.round((budget.monthStats().costUsd - spentStart) * 10000) / 10000;
  return result;
}

module.exports = { ingest, buildPlan };
