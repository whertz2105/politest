#!/usr/bin/env node
// brief-draft.js — CLI + timer entry point for drafting a Daily Brief. Inits the
// analyzer pipeline (needed for self-certification) and the brief store, then runs
// the drafting pipeline. NEVER publishes — it produces a draft for human approval.
//
//   node tools/brief-draft.js [YYYY-MM-DD]
//
// Exit 0 on success OR a clean budget abort; nonzero on real failure.

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");

// A manual CLI run doesn't inherit the systemd EnvironmentFile — load it (KEY=value,
// no shell eval), filling only unset vars, so MODEL/ANTHROPIC_API_KEY are available.
function loadEnvFile() {
  const file = process.env.ANALYZER_ENV || "/etc/politeion/analyzer.env";
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const v = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

(async () => {
  loadEnvFile();
  const axes = await import(pathToFileURL(path.join(ROOT, "js", "axes.js")).href);
  const lr = await import(pathToFileURL(path.join(ROOT, "js", "leftright.js")).href);

  // Init the analyzer subsystem (store + budget + pipeline) so certification works.
  const analyzerRoutes = require("../analyzer/routes");
  analyzerRoutes.init(axes.AXIS_KEYS, lr.leftRightScore);

  const briefStore = require("../brief/store");
  briefStore.init(process.env.BRIEFS_FILE || path.join(ROOT, "store", "briefs.jsonl"));

  const draft = require("../brief/draft");
  let config;
  try { config = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "brief_sources.json"), "utf8")); }
  catch (e) { console.error("could not read data/brief_sources.json:", e.message); process.exit(1); }

  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  try {
    const rec = await draft.draft({ date, config, log: (m) => console.log("[brief]", m) });
    console.log(`draft ${rec.id} for ${rec.date}: ${rec.items.length} certified, ${(rec.review || []).length} need human edit`);
    process.exit(0);
  } catch (e) {
    if (e.code === "budget") { console.log("[brief] budget cap reached — no draft produced (clean abort)"); process.exit(0); }
    console.error("brief draft failed:", e.message);
    process.exit(1);
  }
})().catch((e) => { console.error("brief draft crashed:", e); process.exit(2); });
