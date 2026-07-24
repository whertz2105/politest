#!/usr/bin/env node
// set-role.js — promote/demote an account, or list accounts. Operates directly
// on the accounts SQLite DB (same node:sqlite the server uses), so it works
// whether or not the server is running.
//
//   node tools/set-role.js --list
//   node tools/set-role.js <email> <admin|user>
//
// Uses AUTH_DB from the environment, else the default store/politeion.db — the
// same path the service uses, so run it from the app directory (e.g. /opt/politest).
//
// Note: the running server caches profiles in memory for ~30s. After a change,
// sign out and back in (or wait ~30s) to pick up the new role.

const db = require("../auth/db");

const [, , arg1, arg2] = process.argv;

function usage(code) {
  console.error("usage:\n  node tools/set-role.js --list\n  node tools/set-role.js <email> <admin|user>");
  process.exit(code);
}

try {
  db.init(process.env.AUTH_DB);
} catch (e) {
  console.error("could not open accounts DB:", e.message);
  console.error("(accounts require Node 22.5+ for node:sqlite)");
  process.exit(3);
}
const h = db.handle();

if (arg1 === "--list") {
  const rows = h.prepare("SELECT id, email, full_name, role, created_at FROM users ORDER BY id").all();
  if (!rows.length) { console.log("(no accounts yet)"); process.exit(0); }
  for (const r of rows) console.log(`#${r.id}  ${r.role.padEnd(5)}  ${r.email}  —  ${r.full_name}  (${(r.created_at || "").slice(0, 10)})`);
  process.exit(0);
}

const email = (arg1 || "").trim().toLowerCase();
const role = (arg2 || "").trim();
if (!email || (role !== "admin" && role !== "user")) usage(1);

const u = h.prepare("SELECT id, email, role FROM users WHERE email = ?").get(email);
if (!u) { console.error(`no account with email '${email}'  (run --list to see accounts)`); process.exit(2); }
if (u.role === role) { console.log(`${email} is already '${role}' — no change.`); process.exit(0); }

h.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, u.id);
console.log(`${email}: ${u.role} -> ${role}`);
console.log("Done. Sign out and back in (or wait ~30s) for the change to take effect.");
