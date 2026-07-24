// candidates.js — SINGLE SOURCE OF TRUTH for the Candidates feature's pure logic:
// registry validation, status → display copy, stable race/candidate id derivation,
// the ZIP→district crosswalk, and the sparse match math. No DOM, no fetch — imported
// by the client pages, by tools/audit.js, AND (dynamically) by the server so a
// candidateId computed in the browser is byte-identical to the one the ingester tags
// onto an analysis. Multi-state by design: any data/candidates_<ST>_<cycle>.json (or
// the national tracker) validates and derives here.
import { AXIS_KEYS } from "./axes.js";

// Qualifying thresholds. An axis renders once ≥2 analyses scored it; a full profile
// (and any match) requires ≥3 total qualifying analyses (thin corpus otherwise).
export const CAND_AXIS_MIN = 2;
export const CAND_PROFILE_MIN = 3;

export const KNOWN_STATUSES = [
  "nominee", "primary_unverified", "primary_pending", "special_primary_pending",
  "runoff_unverified", "write_in_unverified", "speculative", "exploratory",
  "declared", "suspended",
];
const KNOWN_PARTIES = ["R", "D", "I", "L", "G"];
const DISTRICT_RE = /^[A-Z]{2}-\d{1,2}$/;

// Status → display copy (the ONE place this mapping lives). `pending` marks slots
// with no nominee yet; `verified` marks a confirmed general-election candidate.
const STATUS = {
  nominee:                 { label: "Nominee", copy: "On the November ballot", verified: true },
  primary_unverified:      { label: "Primary (unverified)", copy: "Advanced from the primary; awaiting certification" },
  primary_pending:         { label: "Primary pending", copy: "Nominee decided in the upcoming primary", pending: true },
  special_primary_pending: { label: "Special primary pending", copy: "Nominee decided in the Aug 11 special primary", pending: true },
  runoff_unverified:       { label: "Runoff (unverified)", copy: "Advanced from a runoff; awaiting certification" },
  write_in_unverified:     { label: "Write-in (unverified)", copy: "Listed as a write-in; on-ballot status unconfirmed" },
  speculative:             { label: "Speculative", copy: "Subject of sustained 2028 coverage; not declared" },
  exploratory:             { label: "Exploratory", copy: "Has formed an exploratory committee" },
  declared:                { label: "Declared", copy: "Has formally declared a candidacy" },
  suspended:               { label: "Suspended", copy: "Campaign suspended" },
};
export function statusInfo(status) { return STATUS[status] || { label: status || "unknown", copy: "" }; }
export function statusCopy(status) { return statusInfo(status).copy; }
export function isPending(status) { return !!statusInfo(status).pending; }

// ---- id derivation (stable, shared client+server) ------------------------
export function slug(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export function raceKey(race) {
  if (race && race.district && DISTRICT_RE.test(race.district)) return race.district.toLowerCase();
  const o = (race && race.office) || "";
  if (/senate/i.test(o)) return "senate";
  if (/governor/i.test(o)) return "governor";
  return slug(o) || "race";
}
export function candidateId(meta, race, cand) {
  const name = slug(cand && cand.name);
  if (meta && meta.state) return `${String(meta.state).toLowerCase()}${meta.cycle}-${raceKey(race)}-${name}`;
  return `us${meta ? meta.cycle : ""}-${name}`; // national tracker (no state)
}

// ---- registry validation + normalization ---------------------------------
// Returns { kind, meta, races?|candidates?, errors, warnings }. A `state` registry
// has races[]; the national tracker has candidates[] + office. Every candidate gets
// its derived `id`, `statusInfo`, and normalized sources.
export function parseRegistry(raw, filename) {
  const errors = [], warnings = [];
  if (!raw || typeof raw !== "object") return { errors: [`${filename || "registry"}: not an object`], warnings };
  const isTracker = !raw.races && Array.isArray(raw.candidates);
  const meta = {
    state: raw.state || null, cycle: raw.cycle, office: raw.office || null,
    generalDate: raw.generalDate || null, rosterAsOf: raw.rosterAsOf || raw.lastReviewed || null,
    registryVersion: raw.registryVersion, notes: raw.notes || raw.inclusionCriteria || "",
    rolling: !!raw.rolling, file: filename || null,
  };
  if (!Number.isInteger(meta.cycle)) errors.push(`${filename}: missing integer "cycle"`);

  const checkCand = (c, where, race) => {
    if (!c || typeof c !== "object") { errors.push(`${where}: not an object`); return null; }
    if (typeof c.name !== "string" || !c.name.trim()) { errors.push(`${where}: missing "name"`); return null; }
    if (!KNOWN_STATUSES.includes(c.status)) errors.push(`${where} (${c.name}): unknown status "${c.status}"`);
    if (c.party && !KNOWN_PARTIES.includes(c.party)) warnings.push(`${where} (${c.name}): unusual party "${c.party}"`);
    const sources = Array.isArray(c.sources) ? c.sources.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)) : [];
    if (Array.isArray(c.sources) && sources.length !== c.sources.length) warnings.push(`${where} (${c.name}): dropped a non-http source`);
    return {
      id: candidateId(meta, race, c), name: c.name, party: c.party || null,
      status: c.status, statusInfo: statusInfo(c.status),
      incumbentOffice: c.incumbentOffice || null, currentOffice: c.currentOffice || null,
      statusAsOf: c.statusAsOf || null, sources,
    };
  };

  if (isTracker) {
    const candidates = [];
    raw.candidates.forEach((c, i) => { const n = checkCand(c, `candidate ${i}`, null); if (n) candidates.push(n); });
    return { kind: "tracker", meta, candidates, errors, warnings };
  }

  if (!Array.isArray(raw.races)) { errors.push(`${filename}: missing "races" array`); return { kind: "state", meta, races: [], errors, warnings }; }
  const races = raw.races.map((r, i) => {
    const where = `race ${i}`;
    if (r.district != null && !DISTRICT_RE.test(r.district)) errors.push(`${where}: bad district "${r.district}"`);
    const candidates = (Array.isArray(r.candidates) ? r.candidates : []).map((c, j) => checkCand(c, `${where} candidate ${j}`, r)).filter(Boolean);
    return { key: raceKey(r), office: r.office || "", level: r.level || null, district: r.district || null, notes: r.notes || "", candidates };
  });
  // duplicate id guard
  const seen = new Set();
  for (const rc of races) for (const c of rc.candidates) { if (seen.has(c.id)) errors.push(`duplicate candidate id ${c.id}`); seen.add(c.id); }
  return { kind: "state", meta, races, errors, warnings };
}

// Flatten every candidate (with race context) for ingestion. Skips zero-source slots.
export function candidatesWithSources(parsed) {
  const out = [];
  const push = (c, race) => { if (c.sources && c.sources.length) out.push({ ...c, race: race ? { key: race.key, office: race.office, district: race.district } : null }); };
  if (parsed.kind === "tracker") parsed.candidates.forEach((c) => push(c, null));
  else parsed.races.forEach((r) => r.candidates.forEach((c) => push(c, r)));
  return out;
}

// ---- ZIP → district crosswalk --------------------------------------------
// parseCrosswalk(csv) → Map(zip → [{district, share}]). Header row skipped.
export function parseCrosswalk(csv) {
  const map = new Map();
  const lines = String(csv || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || (i === 0 && /zip/i.test(line))) continue;
    const [zip, district, share] = line.split(",");
    if (!zip || !district) continue;
    if (!map.has(zip)) map.set(zip, []);
    map.get(zip).push({ district, share: Number(share) || 0 });
  }
  return map;
}
// Districts for a ZIP, tiny slivers (< minShare, default 0.005) hidden, biggest first.
export function lookupZip(map, zip, opts = {}) {
  const minShare = opts.minShare == null ? 0.005 : opts.minShare;
  const rows = map.get(String(zip || "").trim());
  if (!rows) return [];
  return rows.filter((r) => r.share >= minShare).sort((a, b) => b.share - a.share);
}

// ---- sparse match ---------------------------------------------------------
// Salience-weighted RMS (the archetype matcher's shape), but weighted by USER
// priorities and computed ONLY over axes where the candidate has qualifying data
// (n ≥ CAND_AXIS_MIN). A muted axis (weight 0) contributes nothing. Returns
// { pct, axesUsed } or null when no axis qualifies (→ "not enough material").
export function matchScore(userVec, candidateAxes, weights) {
  let sw = 0, swd2 = 0, used = 0;
  for (const k of AXIS_KEYS) {
    const a = candidateAxes && candidateAxes[k];
    if (!a || (a.n || 0) < CAND_AXIS_MIN) continue;
    const w = weights && weights[k] != null ? Number(weights[k]) : 1;
    if (!(w > 0)) continue; // muted axis contributes zero
    const d = (Number(userVec[k]) || 0) - (Number(a.mean) || 0);
    swd2 += w * d * d; sw += w; used++;
  }
  if (!used || !sw) return null;
  const rms = Math.sqrt(swd2 / sw); // 0..200
  return { pct: Math.round(100 * (1 - rms / 200)), axesUsed: used };
}
