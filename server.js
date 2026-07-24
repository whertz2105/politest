#!/usr/bin/env node
// server.js — backend for crowd comparison + item statistics. Node standard
// library only; storage is in server memory backed by an append-only JSONL file.
//
// Records store ONLY anonymous data: the 22 axis scores, the answer mode, the
// bank version, per-item answers (0..100), and an optional self-chosen label.
// No names, no IP retention, no timestamps.
//
// Endpoints (JSON):
//   POST /api/results { vector, mode, bank, items } -> { ok, count, id }
//   POST /api/label   { id, label }                 -> { ok }
//   POST /api/compare { vector, bank }              -> { count, percentiles, sample, axisOrder }
//   GET  /api/stats                                  -> { count, byBank }
//
// Crowd comparison is per-bank: v1 and v2 vectors are never mixed in one cloud.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const analyzerRoutes = require("./analyzer/routes"); // Politeion Analyzer (/api/analyze, etc.)

const ROOT = __dirname;
const HOST = process.env.HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || "3200", 10);
const STORE_FILE = process.env.STORE_FILE || path.join(ROOT, "store", "results.jsonl");
const SAMPLE_CAP = 2000;
const MAX_BODY = 32 * 1024;

// Old 18-axis storage order, for migrating pre-v2 array records.
const OLD_ORDER = ["mkt", "wel", "trd", "soc", "rel", "auth", "sec", "spe", "jus", "dem", "trust", "meth", "fed", "natl", "imm", "fp", "tech", "env"];

let AXIS_KEYS = null, LEGACY_MAP = null;
const records = []; // { v:number[22], mode, bank, items, label }

const clampInt = (n) => { n = Math.round(Number(n)); if (!Number.isFinite(n)) n = 0; return n < -100 ? -100 : n > 100 ? 100 : n; };

function coerceVector(input) {
  if (typeof input !== "object" || input === null) return null;
  return AXIS_KEYS.map((k) => clampInt(input[k]));
}
function coerceItems(input) {
  if (typeof input !== "object" || input === null) return null;
  const out = {};
  let n = 0;
  for (const k of Object.keys(input)) {
    if (n++ > 400) break;
    const v = Math.round(Number(input[k]));
    if (Number.isFinite(v)) out[k] = v < 0 ? 0 : v > 100 ? 100 : v;
  }
  return out;
}
function normalizeRecord(rec) {
  if (Array.isArray(rec)) {
    // legacy 18-axis vector-only record -> v2 shape, bank 1
    const v = new Array(AXIS_KEYS.length).fill(0);
    for (let i = 0; i < OLD_ORDER.length && i < rec.length; i++) {
      const nk = LEGACY_MAP[OLD_ORDER[i]] || OLD_ORDER[i];
      const idx = AXIS_KEYS.indexOf(nk);
      if (idx >= 0) v[idx] = clampInt(rec[i]);
    }
    return { v, mode: "classic", bank: 1, items: null, label: null };
  }
  if (rec && Array.isArray(rec.v) && rec.v.length === AXIS_KEYS.length) {
    return { v: rec.v.map(clampInt), mode: rec.mode || "classic", bank: rec.bank === 2 ? 2 : 1, items: rec.items || null, label: rec.label || null };
  }
  return null;
}

function bankOf(b) { return b === 2 ? 2 : 1; }
function recordsForBank(bank) { return records.filter((r) => r.bank === bank); }

function percentiles(vec, bank) {
  const rs = recordsForBank(bank), n = rs.length, out = {};
  if (n === 0) return out;
  for (let i = 0; i < AXIS_KEYS.length; i++) {
    let less = 0, equal = 0;
    for (let r = 0; r < n; r++) { const v = rs[r].v[i]; if (v < vec[i]) less++; else if (v === vec[i]) equal++; }
    out[AXIS_KEYS[i]] = Math.round(((less + equal / 2) / n) * 100);
  }
  return out;
}
function sample(bank) {
  const rs = recordsForBank(bank), n = rs.length;
  if (n <= SAMPLE_CAP) return rs.map((r) => r.v);
  const stride = n / SAMPLE_CAP, out = [];
  for (let x = 0; x < n && out.length < SAMPLE_CAP; x += stride) out.push(rs[Math.floor(x)].v);
  return out;
}

function persist(rec) {
  fs.appendFile(STORE_FILE, JSON.stringify(rec) + "\n", (err) => { if (err) console.error("append failed:", err.message); });
}
function rewriteStore() {
  // used when a label is added to an existing record
  const tmp = STORE_FILE + ".tmp";
  fs.writeFile(tmp, records.map((r) => JSON.stringify(r)).join("\n") + "\n", (err) => {
    if (err) return console.error("rewrite failed:", err.message);
    fs.rename(tmp, STORE_FILE, (e) => { if (e) console.error("rename failed:", e.message); });
  });
}
function loadStore() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    if (!fs.existsSync(STORE_FILE)) return;
    for (const line of fs.readFileSync(STORE_FILE, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const rec = normalizeRecord(JSON.parse(line)); if (rec) records.push(rec); } catch {}
    }
    const v1 = recordsForBank(1).length, v2 = recordsForBank(2).length;
    console.log(`loaded ${records.length} records (v1:${v1} v2:${v2}) from ${STORE_FILE}`);
  } catch (e) { console.error("loadStore failed:", e.message); }
}

// ---- static fallback (standalone/local use) ----
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url.split("?")[0] || "/"));
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}
function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "", size = 0;
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error("body too large")); req.destroy(); return; } data += c; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || "").split("?")[0];
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    return res.end();
  }

  // Analyzer endpoints take priority over the crowd endpoints and the /api 404.
  if (await analyzerRoutes.handle(req, res, url)) return;

  if (url === "/api/stats" && req.method === "GET") {
    return sendJson(res, 200, { count: records.length, byBank: { v1: recordsForBank(1).length, v2: recordsForBank(2).length } });
  }

  if (url === "/api/results" && req.method === "POST") {
    try {
      const p = JSON.parse((await readBody(req)) || "{}");
      const v = coerceVector(p.vector);
      if (!v) return sendJson(res, 400, { error: "invalid vector" });
      const rec = { v, mode: p.mode === "precision" ? "precision" : "classic", bank: bankOf(p.bank), items: coerceItems(p.items), label: null };
      records.push(rec);
      persist(rec);
      return sendJson(res, 200, { ok: true, id: records.length - 1, count: recordsForBank(rec.bank).length });
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
  }

  if (url === "/api/label" && req.method === "POST") {
    try {
      const p = JSON.parse((await readBody(req)) || "{}");
      const id = Number(p.id);
      if (!Number.isInteger(id) || id < 0 || id >= records.length) return sendJson(res, 400, { error: "bad id" });
      const label = typeof p.label === "string" ? p.label.slice(0, 60) : null;
      records[id].label = label;
      rewriteStore();
      return sendJson(res, 200, { ok: true });
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
  }

  if (url === "/api/compare" && req.method === "POST") {
    try {
      const p = JSON.parse((await readBody(req)) || "{}");
      const v = coerceVector(p.vector);
      if (!v) return sendJson(res, 400, { error: "invalid vector" });
      const bank = bankOf(p.bank);
      return sendJson(res, 200, { count: recordsForBank(bank).length, percentiles: percentiles(v, bank), sample: sample(bank), axisOrder: AXIS_KEYS, bank });
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
  }

  if (url.startsWith("/api/")) return sendJson(res, 404, { error: "no such endpoint" });
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405).end("method not allowed");
});

(async () => {
  const axes = await import(pathToFileURL(path.join(ROOT, "js", "axes.js")).href);
  AXIS_KEYS = axes.AXIS_KEYS;
  LEGACY_MAP = axes.LEGACY_AXIS_MAP;
  analyzerRoutes.init(AXIS_KEYS);
  loadStore();
  server.listen(PORT, HOST, () => console.log(`Politeion API on http://${HOST}:${PORT} (store: ${STORE_FILE})`));
})().catch((e) => { console.error("startup failed:", e); process.exit(1); });
