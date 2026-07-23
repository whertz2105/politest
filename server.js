#!/usr/bin/env node
// server.js — tiny backend for the "compare to everyone" feature.
//
// Endpoints (JSON):
//   POST /api/results   { vector }          -> stores a completed result. { ok, count }
//   POST /api/compare   { vector }          -> read-only: how this vector compares to the
//                                              crowd. { count, percentiles, sample }
//   GET  /api/stats                          -> { count }
//
// Storage is IN SERVER MEMORY, backed by an append-only JSONL file so the crowd
// survives restarts/redeploys (loaded on boot). No accounts, no PII — only the
// 18 anonymous axis scores are ever stored. Node standard library only; no deps.
//
// Binds 127.0.0.1:$PORT (Caddy is the public entrypoint). Static files are served
// as a fallback so `node server.js` also works standalone for local testing;
// behind Caddy, Caddy serves the static files and only proxies /api here.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = __dirname;
const HOST = process.env.HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || "3200", 10);
const STORE_FILE = process.env.STORE_FILE || path.join(ROOT, "store", "results.jsonl");
const SAMPLE_CAP = 2000;      // max points returned for the scatter cloud
const MAX_BODY = 8 * 1024;    // reject oversized request bodies

let AXIS_KEYS = null;
const store = [];             // array of number[18] (in AXIS_KEYS order)

// ---- helpers ----
function coerceVector(input) {
  // Accepts { key: score } and returns a validated number[18] in AXIS_KEYS order.
  if (typeof input !== "object" || input === null) return null;
  const out = new Array(AXIS_KEYS.length);
  for (let i = 0; i < AXIS_KEYS.length; i++) {
    let n = Number(input[AXIS_KEYS[i]]);
    if (!Number.isFinite(n)) n = 0;
    n = Math.round(n);
    out[i] = n < -100 ? -100 : n > 100 ? 100 : n;
  }
  return out;
}

function percentiles(vec) {
  // For each axis, the percentile rank of vec among all stored values.
  const n = store.length;
  const out = {};
  if (n === 0) return out;
  for (let i = 0; i < AXIS_KEYS.length; i++) {
    let less = 0, equal = 0;
    for (let r = 0; r < n; r++) {
      const v = store[r][i];
      if (v < vec[i]) less++; else if (v === vec[i]) equal++;
    }
    out[AXIS_KEYS[i]] = Math.round(((less + equal / 2) / n) * 100);
  }
  return out;
}

function sample() {
  const n = store.length;
  if (n <= SAMPLE_CAP) return store.slice();
  const stride = n / SAMPLE_CAP;
  const out = [];
  for (let x = 0; x < n && out.length < SAMPLE_CAP; x += stride) out.push(store[Math.floor(x)]);
  return out;
}

function persist(vec) {
  fs.appendFile(STORE_FILE, JSON.stringify(vec) + "\n", (err) => {
    if (err) console.error("append failed:", err.message);
  });
}

function loadStore() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    if (!fs.existsSync(STORE_FILE)) return;
    const lines = fs.readFileSync(STORE_FILE, "utf8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const arr = JSON.parse(line);
        if (Array.isArray(arr) && arr.length === AXIS_KEYS.length) store.push(arr.map((x) => Math.round(Number(x)) || 0));
      } catch { /* skip corrupt line */ }
    }
    console.log(`loaded ${store.length} stored results from ${STORE_FILE}`);
  } catch (e) {
    console.error("loadStore failed:", e.message);
  }
}

// ---- static fallback (local/standalone use only) ----
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".map": "application/json" };
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
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "", size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("body too large")); req.destroy(); return; }
      data += c;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ---- routing ----
const server = http.createServer(async (req, res) => {
  const url = (req.url || "").split("?")[0];

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    res.end();
    return;
  }

  if (url === "/api/stats" && req.method === "GET") {
    return sendJson(res, 200, { count: store.length });
  }

  if (url === "/api/results" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body || "{}");
      const vec = coerceVector(parsed.vector);
      if (!vec) return sendJson(res, 400, { error: "invalid vector" });
      store.push(vec);
      persist(vec);
      return sendJson(res, 200, { ok: true, count: store.length });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (url === "/api/compare" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body || "{}");
      const vec = coerceVector(parsed.vector);
      if (!vec) return sendJson(res, 400, { error: "invalid vector" });
      return sendJson(res, 200, { count: store.length, percentiles: percentiles(vec), sample: sample(), axisOrder: AXIS_KEYS });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (url.startsWith("/api/")) return sendJson(res, 404, { error: "no such endpoint" });

  // static fallback
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405).end("method not allowed");
});

(async () => {
  const axes = await import(pathToFileURL(path.join(ROOT, "js", "axes.js")).href);
  AXIS_KEYS = axes.AXIS_KEYS;
  loadStore();
  server.listen(PORT, HOST, () => console.log(`DecaCompass API on http://${HOST}:${PORT} (store: ${STORE_FILE})`));
})().catch((e) => { console.error("startup failed:", e); process.exit(1); });
