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

// v1 is the human-facing rubric revision. Bump on any deliberate rubric edit.
const RUBRIC_VERSION = "v1";

let _text = null;
let _sha = null;

function load() {
  if (_text !== null) return;
  _text = fs.readFileSync(RUBRIC_FILE, "utf8");
  _sha = crypto.createHash("sha256").update(_text, "utf8").digest("hex");
}

function rubricText() { load(); return _text; }
function rubricSha256() { load(); return _sha; }
function rubricShort() { load(); return _sha.slice(0, 12); }

// The full provenance stamp stored on each analysis. Model is included because a
// model swap is a recalibration event even with an unchanged rubric file.
function rubricStamp(model) {
  load();
  return { version: RUBRIC_VERSION, sha256: _sha, model: model || null };
}

module.exports = { RUBRIC_FILE, RUBRIC_VERSION, rubricText, rubricSha256, rubricShort, rubricStamp };
