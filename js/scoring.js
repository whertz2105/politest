// scoring.js — validation of the (untrusted) question file and score computation.
import { AXIS_KEYS, isAxisKey } from "./axes.js";

// Validate the raw parsed questions.json. Returns { questions, errors, warnings }.
// `questions` contains only the structurally-valid entries so the app can still
// run; `errors`/`warnings` are surfaced on data.html.
export function validateQuestions(raw) {
  const errors = [];
  const warnings = [];
  const questions = [];
  const seenIds = new Set();

  if (!Array.isArray(raw)) {
    return { questions, errors: ["questions.json is not a JSON array."], warnings };
  }

  raw.forEach((q, i) => {
    const where = `item ${i}` + (q && q.id != null ? ` (id ${q.id})` : "");
    if (typeof q !== "object" || q === null) {
      errors.push(`${where}: not an object.`);
      return;
    }
    if (!Number.isInteger(q.id)) {
      errors.push(`${where}: missing/invalid integer "id".`);
      return;
    }
    if (seenIds.has(q.id)) {
      errors.push(`item ${i}: duplicate id ${q.id}.`);
      return;
    }
    seenIds.add(q.id);

    if (typeof q.text !== "string" || q.text.trim() === "") {
      errors.push(`${where}: missing/empty "text".`);
      return;
    }
    if (typeof q.axes !== "object" || q.axes === null || Array.isArray(q.axes)) {
      errors.push(`${where}: missing "axes" object.`);
      return;
    }

    const axisKeys = Object.keys(q.axes);
    if (axisKeys.length === 0) {
      errors.push(`${where}: "axes" is empty.`);
      return;
    }

    let ok = true;
    for (const k of axisKeys) {
      if (!isAxisKey(k)) {
        errors.push(`${where}: unknown axis key "${k}".`);
        ok = false;
        continue;
      }
      const w = q.axes[k];
      if (!Number.isInteger(w) || w < -2 || w > 2) {
        errors.push(`${where}: weight for "${k}" is ${w}; must be an integer in -2..2.`);
        ok = false;
      } else if (w === 0) {
        warnings.push(`${where}: weight for "${k}" is 0 (no effect).`);
      }
    }
    if (q.core !== undefined && typeof q.core !== "boolean") {
      warnings.push(`${where}: "core" should be a boolean.`);
    }
    if (ok) questions.push(q);
  });

  return { questions, errors, warnings };
}

// The subset served for a given mode. "quick" => only core:true questions.
export function questionsForMode(questions, mode) {
  return mode === "quick" ? questions.filter((q) => q.core === true) : questions;
}

// Maximum attainable |score| for one axis over a served question set.
// Max answer magnitude is 2, so it's 2 * Σ|weight| across questions loading the axis.
export function maxAttainable(servedQuestions, axisKey) {
  let sum = 0;
  for (const q of servedQuestions) {
    const w = q.axes[axisKey];
    if (typeof w === "number") sum += Math.abs(w);
  }
  return sum * 2;
}

// Number of questions in the served set that load an axis.
export function itemCount(servedQuestions, axisKey) {
  let n = 0;
  for (const q of servedQuestions) {
    if (typeof q.axes[axisKey] === "number" && q.axes[axisKey] !== 0) n++;
  }
  return n;
}

// Compute normalized scores.
//   answers: Map or object of { questionId -> answer(-2..2) }
//   servedQuestions: the array actually presented (already mode-filtered)
// Returns { vector:{key->-100..100}, raw:{key->rawSum}, max:{key}, counts:{key}, answered:{key} }.
export function computeScores(answers, servedQuestions) {
  const getAns = answers instanceof Map
    ? (id) => answers.get(id)
    : (id) => answers[id];

  const raw = {};
  const answered = {};
  for (const k of AXIS_KEYS) { raw[k] = 0; answered[k] = 0; }

  for (const q of servedQuestions) {
    const a = getAns(q.id);
    if (a === undefined || a === null) continue;
    const av = Number(a);
    if (!Number.isFinite(av) || av === 0) {
      // Neutral (0) contributes nothing but still counts as "seen" for answered.
      if (av === 0) for (const k of Object.keys(q.axes)) if (isAxisKey(k)) answered[k]++;
      continue;
    }
    for (const k of Object.keys(q.axes)) {
      if (!isAxisKey(k)) continue;
      raw[k] += av * q.axes[k];
      answered[k]++;
    }
  }

  const vector = {};
  const max = {};
  const counts = {};
  for (const k of AXIS_KEYS) {
    const m = maxAttainable(servedQuestions, k);
    max[k] = m;
    counts[k] = itemCount(servedQuestions, k);
    vector[k] = m === 0 ? 0 : clamp(Math.round((raw[k] / m) * 100), -100, 100);
  }

  return { vector, raw, max, counts, answered };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
