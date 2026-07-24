// registry.js (candidates) — server-side loader for every data/candidates_*_20NN.json
// (multi-state drop-in). Dynamically imports the SAME pure js/candidates.js the
// browser uses, so a candidateId computed here is byte-identical to the client's.
// Holds the parsed registries in memory and indexes candidates by id (for the
// profile route) and by sources (for ingestion).

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

let C = null;                 // the pure js/candidates.js module
let DATA_DIR = "";
const registries = [];        // [{ file, kind, meta, races|candidates, errors, warnings }]
const candById = new Map();   // candidateId -> { meta, cand, race|null }

async function init(dataDir) {
  DATA_DIR = dataDir;
  C = await import(pathToFileURL(path.join(__dirname, "..", "js", "candidates.js")).href);
  load();
}

function indexAll(parsed) {
  const put = (cand, race) => candById.set(cand.id, { meta: parsed.meta, cand, race: race || null });
  if (parsed.kind === "tracker") parsed.candidates.forEach((c) => put(c, null));
  else (parsed.races || []).forEach((r) => r.candidates.forEach((c) => put(c, r)));
}

function load() {
  registries.length = 0; candById.clear();
  let files = [];
  try { files = fs.readdirSync(DATA_DIR).filter((f) => /^candidates_.+_20\d\d\.json$/.test(f)).sort(); } catch { /* dir may not exist */ }
  for (const file of files) {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")); }
    catch (e) { console.error(`candidates: bad JSON ${file}: ${e.message}`); registries.push({ file, kind: "invalid", meta: { file }, errors: [`${file}: ${e.message}`], warnings: [] }); continue; }
    const parsed = C.parseRegistry(raw, file);
    parsed.file = file;
    registries.push(parsed);
    indexAll(parsed);
  }
  const errs = registries.reduce((n, r) => n + (r.errors ? r.errors.length : 0), 0);
  console.log(`candidates: loaded ${registries.length} registr${registries.length === 1 ? "y" : "ies"}, ${candById.size} candidates${errs ? `, ${errs} validation error(s)` : ""}`);
}

function all() { return registries; }
function candidate(id) { return candById.get(id) || null; }

// Flat list of candidates (with sources) to ingest, optionally filtered by state
// and/or race key set. Tracker candidates have race=null and match only when no
// race filter is given.
function candidatesForIngest(filter) {
  const out = [];
  for (const [, entry] of candById) {
    const { meta, cand, race } = entry;
    if (!cand.sources || !cand.sources.length) continue;
    if (filter && filter.state && meta.state && String(meta.state).toLowerCase() !== String(filter.state).toLowerCase()) continue;
    if (filter && filter.races && !(race && filter.races.has(race.key))) continue;
    out.push({ meta, ...cand, race: race ? { key: race.key, office: race.office, district: race.district } : null });
  }
  return out;
}

module.exports = { init, load, all, candidate, candidatesForIngest };
