// draft.js — the Daily Brief drafting pipeline. Invoked by tools/brief-draft.js
// (CLI) and the systemd timer. It NEVER publishes; it produces a `draft` record for
// human approval. Every model call is budget-counted with kind:"brief". It reuses
// the existing provider adapter, the SSRF fetcher, and the analyzer pipeline (for
// self-certification) — no new inference or fetch paths.
//
// Flow: fetch wire feeds → cluster (>=2 outlets) → draft each with the brief prompt
// → self-certify (rewrite once on failure, else park for human edit) → assemble the
// mechanical "Today" section → store as a draft.

const fs = require("fs");
const path = require("path");
const provider = require("../analyzer/provider");
const budget = require("../analyzer/budget");
const fetchUrl = require("../analyzer/fetch-url");
const analyze = require("../analyzer/analyze");
const analyzerStore = require("../analyzer/store");
const rubric = require("../analyzer/rubric");
const { clusterStories } = require("./cluster");
const { collectYesterday } = require("./sources");
const { certifyItem, failingAxes } = require("./certify");
const briefStore = require("./store");

const BRIEF_VERSION = "v1";
const PROMPT_FILE = path.join(__dirname, "..", "data", "brief_system_prompt.md");
const MAX_STORIES = 10;

let _prompt = null;
function promptText() { if (_prompt === null) _prompt = fs.readFileSync(PROMPT_FILE, "utf8"); return _prompt; }
function accUsage(t, u) { if (!u) return; t.input += u.input || 0; t.output += u.output || 0; t.cacheRead += u.cacheRead || 0; t.cacheCreation += u.cacheCreation || 0; }
const zeroUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });

// One drafting model call → a validated item shape.
async function draftOne(story, model, usage) {
  const srcLines = story.members.map((m) => `- (${m.source}) ${m.title}${m.url ? ` [${m.url}]` : ""}`).join("\n");
  const user = `Draft ONE neutral brief item from these ${story.members.length} sources covering the same story:\n${srcLines}\n\nReturn ONLY the strict JSON object defined in your instructions.`;
  const res = await provider.callModel({ system: promptText(), user });
  accUsage(usage, res.usage); budget.record(res.usage, model, "brief");
  const parsed = analyze.extractJson(res.text);
  if (!parsed) throw new Error("model returned invalid JSON");
  const links = Array.isArray(parsed.links) && parsed.links.length
    ? parsed.links.filter((l) => /^https?:\/\//i.test(l))
    : story.members.map((m) => m.url).filter(Boolean);
  return {
    headline: String(parsed.headline || "").slice(0, 90),
    summary: String(parsed.summary || ""),
    why_it_matters: String(parsed.why_it_matters || "").slice(0, 240),
    links: [...new Set(links)].slice(0, 6),
    sources: story.outlets,
  };
}

// Rewrite a failed item with its failing framing fed back.
async function rewriteOne(item, analysis, story, model, usage) {
  const fails = failingAxes(analysis).map((f) => `${f.axis} ${f.score > 0 ? "+" : ""}${f.score} on: "${f.evidence}"`).join("; ");
  const srcLines = story.members.map((m) => `- (${m.source}) ${m.title}`).join("\n");
  const user = `Your previous draft was scored as taking a stance and must be rewritten to read as neutral.\nDetected framing to remove: ${fails || "(unspecified)"}\nRewrite the item keeping the facts but stripping that framing. Sources:\n${srcLines}\n\nReturn ONLY the strict JSON object.`;
  const res = await provider.callModel({ system: promptText(), user });
  accUsage(usage, res.usage); budget.record(res.usage, model, "brief");
  const parsed = analyze.extractJson(res.text) || {};
  return {
    headline: String(parsed.headline || item.headline).slice(0, 90),
    summary: String(parsed.summary || item.summary),
    why_it_matters: String(parsed.why_it_matters || item.why_it_matters).slice(0, 240),
    links: item.links,
    sources: item.sources,
  };
}

// Run an item's text through the EXISTING analyzer pipeline (admin flag bypasses
// the per-IP rate limit; usage is budget-counted as "brief"; origin:"brief" keeps
// it out of the public analyzer lists). Returns the analysis for the neutrality gate.
async function certifyText(item, usage) {
  const text = `${item.headline}. ${item.summary} ${item.why_it_matters}`.trim();
  const out = await analyze.submit({ ip: "brief", text, meta: { title: item.headline }, admin: true, kind: "brief", origin: "brief" });
  const rec = analyzerStore.getById(out.id);
  return {
    id: out.id,
    stance_detected: rec ? rec.stance_detected : true,
    flags: rec ? rec.flags : ["error"],
    flagged: rec ? rec.flagged : true,
    axes: rec ? rec.axes : {},
  };
}

// "Today": expected events, assembled mechanically from the calendar config (no
// model call). Kept deliberately simple and robust; phrasing can be smoothed later.
async function assembleToday(config) {
  return ((config && config.today) || []).map((s) => ({ name: s.name, kind: s.kind || "event", url: s.url || null, note: s.note || "" }));
}

// The public entry. Returns the stored draft record. Aborts cleanly (throws with
// .code="budget") if the monthly cap is already hit; stops mid-run if it trips.
async function draft({ date, config, log = () => {} }) {
  if (budget.overBudget()) { const e = new Error("monthly analysis budget reached — brief draft aborted"); e.code = "budget"; throw e; }
  const model = provider.config().model;
  const warn = (m) => log("warn: " + m);
  const usage = zeroUsage();

  const candidates = await collectYesterday(config, fetchUrl.fetchText, warn);
  log(`collected ${candidates.length} candidate items`);
  const { selected } = clusterStories(candidates);
  const stories = selected.slice(0, MAX_STORIES);
  log(`clustered → ${stories.length} multi-outlet stories`);

  const items = [], review = [];
  for (const story of stories) {
    if (budget.overBudget()) { warn("budget reached mid-draft; stopping"); break; }
    let drafted;
    try { drafted = await draftOne(story, model, usage); }
    catch (e) { warn(`draft failed for "${story.headlineSeed}": ${e.message}`); continue; }

    const res = await certifyItem(drafted, {
      certify: (it) => certifyText(it, usage),
      rewrite: (it, analysis) => rewriteOne(it, analysis, story, model, usage),
      maxRewrites: 1,
    });
    const item = { ...res.item, analysisId: res.analysisId, certOk: res.certOk };
    if (res.certOk) items.push(item);
    else { item.needsHuman = true; review.push(item); }
    log(`item "${item.headline}" → ${res.certOk ? "certified" : "needs human edit"}`);
  }

  const today = await assembleToday(config);
  const rec = briefStore.save({
    date, status: "draft", brief_version: BRIEF_VERSION, rubric_version: rubric.RUBRIC_VERSION,
    items, review, today, usage, generated_at: new Date().toISOString(),
  });
  log(`draft ${rec.id}: ${items.length} certified, ${review.length} need human edit`);
  return rec;
}

// Re-certify a brief's uncertified/edited items (no rewrite — the human edited it,
// so we test as-is). Used by the admin surface before approval is allowed.
async function recertify(brief) {
  const usage = brief.usage || zeroUsage();
  const pool = [...(brief.items || []), ...(brief.review || [])];
  const items = [], review = [];
  for (const it of pool) {
    if (it.certOk) { items.push(it); continue; }
    const res = await certifyItem(it, { certify: (x) => certifyText(x, usage), rewrite: (x) => Promise.resolve(x), maxRewrites: 0 });
    const ni = { ...res.item, analysisId: res.analysisId, certOk: res.certOk };
    if (res.certOk) { delete ni.needsHuman; items.push(ni); } else { ni.needsHuman = true; review.push(ni); }
  }
  brief.items = items; brief.review = review; brief.usage = usage;
  return briefStore.save(brief);
}

module.exports = { draft, recertify, certifyText, BRIEF_VERSION };
