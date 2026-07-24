// budget.js — per-analysis token/usage logging, monthly spend estimation, and a
// hard budget cap. The cap (MONTHLY_BUDGET_USD, from the systemd EnvironmentFile)
// is enforced BEFORE a job runs: once the month's estimated spend reaches it, new
// jobs are refused with "monthly analysis budget reached". A stats line reports
// this month's analyses, tokens, and estimated spend vs the cap (warn at 80%).
//
// Pricing is per model, $/1M tokens. Cache-read tokens bill at ~10% of the input
// rate; cache-creation at ~125%. Values can be overridden via env for other
// models; defaults cover claude-haiku-4-5.

const fs = require("fs");
const path = require("path");

// $/1M tokens by model-id prefix. input/output are the base rates.
const PRICING = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet": { input: 3.0, output: 15.0 },
  "claude-opus": { input: 5.0, output: 25.0 },
};
const CACHE_READ_MULT = 0.1;
const CACHE_CREATE_MULT = 1.25;

let USAGE_FILE = "";
const entries = []; // { ts, model, input, output, cacheRead, cacheCreation, cost }

function init(usageFile) {
  USAGE_FILE = usageFile;
  load();
}

function priceFor(model) {
  const envIn = Number(process.env.PRICE_INPUT_PER_MTOK);
  const envOut = Number(process.env.PRICE_OUTPUT_PER_MTOK);
  if (Number.isFinite(envIn) && Number.isFinite(envOut)) return { input: envIn, output: envOut };
  const m = String(model || "").toLowerCase();
  for (const key of Object.keys(PRICING)) if (m.startsWith(key)) return PRICING[key];
  return PRICING["claude-haiku-4-5"]; // sane default
}

function estimateCost(usage, model) {
  const p = priceFor(model);
  const u = usage || {};
  return (
    ((u.input || 0) / 1e6) * p.input +
    ((u.output || 0) / 1e6) * p.output +
    ((u.cacheRead || 0) / 1e6) * p.input * CACHE_READ_MULT +
    ((u.cacheCreation || 0) / 1e6) * p.input * CACHE_CREATE_MULT
  );
}

function monthKey(d) { const x = d instanceof Date ? d : new Date(d); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`; }

function record(usage, model) {
  const e = {
    ts: new Date().toISOString(),
    model: model || null,
    input: usage.input || 0,
    output: usage.output || 0,
    cacheRead: usage.cacheRead || 0,
    cacheCreation: usage.cacheCreation || 0,
    cost: estimateCost(usage, model),
  };
  entries.push(e);
  fs.appendFile(USAGE_FILE, JSON.stringify(e) + "\n", (err) => { if (err) console.error("usage append failed:", err.message); });
  return e;
}

function load() {
  try {
    fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    if (!fs.existsSync(USAGE_FILE)) return;
    for (const line of fs.readFileSync(USAGE_FILE, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { entries.push(JSON.parse(line)); } catch {}
    }
  } catch (e) { console.error("usage load failed:", e.message); }
}

function capUsd() {
  const c = Number(process.env.MONTHLY_BUDGET_USD);
  return Number.isFinite(c) && c > 0 ? c : null; // null = unlimited
}

function monthStats() {
  const mk = monthKey(new Date());
  const cur = entries.filter((e) => monthKey(e.ts) === mk);
  const tok = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  let cost = 0;
  for (const e of cur) {
    tok.input += e.input; tok.output += e.output; tok.cacheRead += e.cacheRead; tok.cacheCreation += e.cacheCreation;
    cost += e.cost;
  }
  const cap = capUsd();
  const pctOfCap = cap ? cost / cap : null;
  return {
    month: mk,
    analyses: cur.length,
    tokens: tok,
    costUsd: Math.round(cost * 10000) / 10000,
    capUsd: cap,
    pctOfCap: pctOfCap === null ? null : Math.round(pctOfCap * 1000) / 1000,
    warn: pctOfCap !== null && pctOfCap >= 0.8,
    exhausted: pctOfCap !== null && cost >= cap,
  };
}

// Called before running a job. Returns true if the month's spend has reached cap.
function overBudget() { return monthStats().exhausted; }

module.exports = { init, record, estimateCost, monthStats, overBudget, capUsd, priceFor };
