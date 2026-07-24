// users.js — account operations: password hashing (scrypt, stdlib), registration,
// login verification, sessions, admin seeding, and subscription accessors.
// Passwords are never stored in plaintext and never returned to clients.

const crypto = require("crypto");
const { handle } = require("./db");

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SCRYPT_N = 16384, SCRYPT_r = 8, SCRYPT_p = 1, KEYLEN = 64;
const CURRENT_YEAR = 2026; // birth-year sanity bound (stamped, not derived from clock)

const nowIso = () => new Date().toISOString();

// ---- password hashing ----------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString("hex")}$${dk.toString("hex")}`;
}
function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const dk = crypto.scryptSync(password, salt, expected.length, { N: +N, r: +r, p: +p });
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  } catch { return false; }
}

// ---- validation ----------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateRegistration(input, { allowNonEmail } = {}) {
  const errors = [];
  const full_name = String(input.full_name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  const birthYear = parseInt(input.birth_year, 10);

  if (full_name.length < 2 || full_name.length > 120) errors.push("Full name is required.");
  if (!email || (!allowNonEmail && !EMAIL_RE.test(email)) || email.length > 200) errors.push("A valid email is required.");
  if (password.length < 8 || password.length > 200) errors.push("Password must be at least 8 characters.");
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > CURRENT_YEAR) errors.push("A valid birth year is required.");
  return { errors, clean: { full_name, email, password, birth_year: birthYear } };
}

// ---- public shape (never leaks password_hash) ----------------------------
function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    birth_year: row.birth_year,
    role: row.role,
    subscription: { tier: row.subscription_tier, status: row.subscription_status, updated_at: row.subscription_updated_at || null },
    created_at: row.created_at,
  };
}

// ---- users ---------------------------------------------------------------
function getUserByEmail(email) {
  return handle().prepare("SELECT * FROM users WHERE email = ?").get(String(email || "").trim().toLowerCase()) || null;
}
function getUserById(id) {
  return handle().prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
}

// Create a user. Throws Error with .code="email_taken" on duplicate email.
function createUser({ full_name, email, password, birth_year, role = "user" }) {
  const db = handle();
  if (getUserByEmail(email)) { const e = new Error("email already registered"); e.code = "email_taken"; throw e; }
  const info = db.prepare(
    `INSERT INTO users (email, full_name, birth_year, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(email, full_name, birth_year == null ? null : birth_year, hashPassword(password), role, nowIso());
  return getUserById(info.lastInsertRowid);
}

// Verify login credentials. Returns the user row or null.
function verifyLogin(identifier, password) {
  const row = getUserByEmail(identifier);
  if (!row) { crypto.scryptSync(password, "x", 1); return null; } // constant-ish work on miss
  return verifyPassword(password, row.password_hash) ? row : null;
}

// ---- sessions ------------------------------------------------------------
function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const created = nowIso();
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  handle().prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, created, expires);
  return { token, expires };
}
function getSessionUser(token) {
  if (!token) return null;
  const db = handle();
  const s = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!s) return null;
  if (new Date(s.expires_at).getTime() < Date.now()) { db.prepare("DELETE FROM sessions WHERE token = ?").run(token); return null; }
  return getUserById(s.user_id);
}
function deleteSession(token) {
  if (token) handle().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// ---- admin seed ----------------------------------------------------------
// Create the admin account once, from env, so the literal password never lives
// in the repo. After first boot it is an ordinary user row (hashed password) and
// ADMIN_PASSWORD can be removed from the environment.
function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || "admin").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const existing = getUserByEmail(email);
  if (existing) return; // already provisioned — leave it alone
  if (!password) { console.warn(`[auth] no admin account and ADMIN_PASSWORD unset — set ADMIN_PASSWORD to seed '${email}'`); return; }
  if (password.length < 8) { console.warn("[auth] ADMIN_PASSWORD too short; admin not seeded"); return; }
  createUser({ full_name: "Administrator", email, password, birth_year: null, role: "admin" });
  console.log(`[auth] seeded admin account '${email}'`);
}

module.exports = {
  hashPassword, verifyPassword, validateRegistration, publicUser,
  getUserByEmail, getUserById, createUser, verifyLogin,
  createSession, getSessionUser, deleteSession, seedAdmin,
  SESSION_TTL_MS,
};
