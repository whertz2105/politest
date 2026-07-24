// routes.js — authentication HTTP surface, mounted under /api/auth by server.js.
//
//   POST /api/auth/register  { full_name, email, password, birth_year }
//   POST /api/auth/login     { email, password }
//   POST /api/auth/logout
//   GET  /api/auth/me                      -> { user | null }
//   GET  /api/auth/subscription            -> { tier, status } (scaffold)
//
// Sessions are an httpOnly cookie (pol_session) mapped to a DB session row.
// Signed-in user profiles are cached in memory (keyed by token) for fast reads.
// Exposes currentUser(req) / isAdminSession(req) for other modules.

const db = require("./db");
const U = require("./users");

const MAX_BODY = 16 * 1024;
const COOKIE = "pol_session";
const CACHE_TTL_MS = 30 * 1000;
const LOGIN_MAX = 10, LOGIN_WINDOW_MS = 15 * 60 * 1000;

let ready = false;
let initError = null;
const cache = new Map();       // token -> { user, exp }
const loginHits = new Map();   // ip -> [timestamps]

// Initialize accounts. NEVER throws: if the DB can't open (e.g. Node lacks
// node:sqlite), accounts are disabled and /api/auth/* returns a clean 503, but
// the rest of the server (analyzer, crowd, static) keeps running.
function init(dbPath) {
  try {
    db.init(dbPath);
    U.seedAdmin();
    ready = true;
  } catch (e) {
    ready = false; initError = e.message;
    console.error("[auth] accounts DISABLED:", e.message);
  }
}

// ---- helpers -------------------------------------------------------------
function sendJson(res, code, obj, extraHeaders) {
  res.writeHead(code, Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, extraHeaders || {}));
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
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function sessionCookie(token, maxAgeSec) {
  const secure = process.env.COOKIE_INSECURE === "1" ? "" : " Secure;";
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax;${secure} Max-Age=${maxAgeSec}`;
}
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}
function loginAllow(ip) {
  const now = Date.now();
  const arr = (loginHits.get(ip) || []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (arr.length >= LOGIN_MAX) { loginHits.set(ip, arr); return false; }
  arr.push(now); loginHits.set(ip, arr); return true;
}

// ---- current user (cached) ----------------------------------------------
function currentUser(req) {
  if (!ready) return null;
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  const user = U.publicUser(U.getSessionUser(token));
  if (user) cache.set(token, { user, exp: Date.now() + CACHE_TTL_MS });
  else cache.delete(token);
  return user;
}
function isAdminSession(req) {
  const u = currentUser(req);
  return !!u && u.role === "admin";
}
function invalidate(token) { if (token) cache.delete(token); }

// ---- handler -------------------------------------------------------------
async function handle(req, res, urlPath) {
  if (!urlPath.startsWith("/api/auth/")) return false;
  // Own the /api/auth/* namespace even when disabled, so it returns clean JSON
  // (not a fall-through) — /me stays usable (returns null) so pages don't error.
  if (!ready) {
    if (urlPath === "/api/auth/me" && req.method === "GET") { sendJson(res, 200, { user: null, accounts_available: false }); return true; }
    sendJson(res, 503, { error: "Accounts are temporarily unavailable." });
    return true;
  }

  if (urlPath === "/api/auth/me" && req.method === "GET") {
    sendJson(res, 200, { user: currentUser(req) });
    return true;
  }

  if (urlPath === "/api/auth/subscription" && req.method === "GET") {
    const u = currentUser(req);
    if (!u) { sendJson(res, 401, { error: "not signed in" }); return true; }
    // Scaffold: subscriptions/paid API access are not built yet.
    sendJson(res, 200, { tier: u.subscription.tier, status: u.subscription.status, available: false, note: "Subscriptions and paid API access are coming soon." });
    return true;
  }

  if (urlPath === "/api/auth/register" && req.method === "POST") {
    try {
      const p = JSON.parse((await readBody(req)) || "{}");
      const { errors, clean } = U.validateRegistration(p);
      if (errors.length) { sendJson(res, 400, { error: errors.join(" ") }); return true; }
      let user;
      try { user = U.createUser(clean); }
      catch (e) { if (e.code === "email_taken") { sendJson(res, 409, { error: "That email is already registered." }); return true; } throw e; }
      const { token } = U.createSession(user.id);
      sendJson(res, 200, { user: U.publicUser(user) }, { "Set-Cookie": sessionCookie(token, Math.floor(U.SESSION_TTL_MS / 1000)) });
    } catch (e) { sendJson(res, 400, { error: e.message }); }
    return true;
  }

  if (urlPath === "/api/auth/login" && req.method === "POST") {
    try {
      if (!loginAllow(clientIp(req))) { sendJson(res, 429, { error: "Too many attempts. Try again later." }); return true; }
      const p = JSON.parse((await readBody(req)) || "{}");
      const row = U.verifyLogin(p.email, String(p.password || ""));
      if (!row) { sendJson(res, 401, { error: "Incorrect email or password." }); return true; }
      const { token } = U.createSession(row.id);
      sendJson(res, 200, { user: U.publicUser(row) }, { "Set-Cookie": sessionCookie(token, Math.floor(U.SESSION_TTL_MS / 1000)) });
    } catch (e) { sendJson(res, 400, { error: e.message }); }
    return true;
  }

  if (urlPath === "/api/auth/results" && req.method === "GET") {
    const u = currentUser(req);
    if (!u) { sendJson(res, 401, { error: "not signed in" }); return true; }
    sendJson(res, 200, { results: U.listResults(u.id) });
    return true;
  }

  if (urlPath === "/api/auth/results" && req.method === "POST") {
    try {
      const u = currentUser(req);
      if (!u) { sendJson(res, 401, { error: "Sign in to save this result." }); return true; }
      const p = JSON.parse((await readBody(req)) || "{}");
      const enc = typeof p.enc === "string" ? p.enc : "";
      if (!/^[A-Za-z0-9_\-=]{4,4000}$/.test(enc)) { sendJson(res, 400, { error: "invalid result" }); return true; }
      const vin = p.vector && typeof p.vector === "object" ? p.vector : {};
      const vector = {}; let n = 0;
      for (const k of Object.keys(vin)) { if (n++ > 50) break; const v = Math.round(Number(vin[k])); if (Number.isFinite(v)) vector[k] = Math.max(-100, Math.min(100, v)); }
      // Per-axis precision { count, sigma }, coerced and bounded (sigma 0..200).
      let precision = null;
      const pin = p.precision && typeof p.precision === "object" ? p.precision : null;
      if (pin) {
        precision = {}; let m = 0;
        for (const k of Object.keys(pin)) {
          if (m++ > 50) break;
          const e = pin[k]; if (!e || typeof e !== "object") continue;
          const sigma = Number(e.sigma), count = Number(e.count);
          if (!Number.isFinite(sigma)) continue;
          precision[k] = { count: Number.isFinite(count) ? Math.max(0, Math.min(9999, Math.round(count))) : 0, sigma: Math.max(0, Math.min(200, Math.round(sigma * 10) / 10)) };
        }
      }
      const row = U.saveResult(u.id, {
        enc, vector, precision,
        bank: Number(p.bank) || null,
        answerMode: p.answerMode ? String(p.answerMode).slice(0, 20) : null,
        testMode: p.testMode ? String(p.testMode).slice(0, 20) : null,
        label: p.label ? String(p.label).slice(0, 80) : null,
      });
      sendJson(res, 200, { ok: true, id: row ? row.id : null });
    } catch (e) { sendJson(res, 400, { error: e.message }); }
    return true;
  }

  if (urlPath.startsWith("/api/auth/results/") && req.method === "DELETE") {
    const u = currentUser(req);
    if (!u) { sendJson(res, 401, { error: "not signed in" }); return true; }
    const id = Number(urlPath.slice("/api/auth/results/".length));
    U.deleteResult(u.id, id);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (urlPath === "/api/auth/logout" && req.method === "POST") {
    const token = parseCookies(req)[COOKIE];
    U.deleteSession(token);
    invalidate(token);
    sendJson(res, 200, { ok: true }, { "Set-Cookie": `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0` });
    return true;
  }

  sendJson(res, 404, { error: "no such auth endpoint" });
  return true;
}

module.exports = { init, handle, currentUser, isAdminSession };
