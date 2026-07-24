// rubric.js — loads the Analyzer system prompt (data/analyzer_system_prompt.md)
// and derives its content hash. The prompt is the CACHED system block sent on
// every request, byte-identical, so cache_read applies. The content hash is
// stamped into every stored analysis. Any edit to this file (or a MODEL change)
// is a recalibration event: bump RUBRIC_VERSION and rerun tools/calibrate.js.
//
// The version tag combines the rubric content hash with the active model, because
// changing either changes what the scores mean.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RUBRIC_FILE = path.join(__dirname, "..", "data", "analyzer_system_prompt.md");
// Public methodology summary — what is measured and flagged, NOT the prompt.
const SUMMARY_FILE = path.join(__dirname, "..", "data", "rubric_summary.md");

// Human-facing rubric revision. Bump on any deliberate rubric edit.
// v2 added the required neutral_summary output field.
const RUBRIC_VERSION = "v2";

let _text = null;
let _sha = null;
let _summary = null;

function load() {
  if (_text !== null) return;
  _text = fs.readFileSync(RUBRIC_FILE, "utf8");
  _sha = crypto.createHash("sha256").update(_text, "utf8").digest("hex");
}

// The full scoring prompt — used for inference and hashing ONLY. It is proprietary
// and MUST NOT be returned to clients. Nothing outside provider.js should call this.
function rubricText() { load(); return _text; }
function rubricSha256() { load(); return _sha; }
function rubricShort() { load(); return _sha.slice(0, 12); }

// The public methodology summary (safe to publish). Falls back to a short note if
// the file is missing so the Data page never leaks the prompt as a fallback.
function rubricSummary() {
  if (_summary === null) {
    try { _summary = fs.readFileSync(SUMMARY_FILE, "utf8"); }
    catch { _summary = "Methodology summary unavailable."; }
  }
  return _summary;
}

// The full provenance stamp stored on each analysis. Model is included because a
// model swap is a recalibration event even with an unchanged rubric file.
function rubricStamp(model) {
  load();
  return { version: RUBRIC_VERSION, sha256: _sha, model: model || null };
}

module.exports = { RUBRIC_FILE, RUBRIC_VERSION, rubricText, rubricSummary, rubricSha256, rubricShort, rubricStamp };
