// db.js — SQLite persistence for accounts, sessions, and (scaffolded)
// subscriptions / API keys. Uses the Node standard-library SQLite module
// (node:sqlite, DatabaseSync) — no npm dependency. The DB file lives under
// store/ (gitignored), so no user data is ever committed.
//
// node:sqlite is stdlib but still marked experimental; it emits a one-time
// ExperimentalWarning on load. That is expected and harmless.

const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

let db = null;

function init(dbPath) {
  const file = dbPath || process.env.AUTH_DB || path.join(__dirname, "..", "store", "politeion.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate();
  console.log(`accounts DB ready at ${file}`);
  return db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      birth_year INTEGER,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      subscription_tier TEXT NOT NULL DEFAULT 'free',
      subscription_status TEXT NOT NULL DEFAULT 'inactive',
      subscription_updated_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Future subscription records (not wired to any payment provider yet).
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT,
      provider_customer_id TEXT,
      provider_subscription_id TEXT,
      current_period_end TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Future paid programmatic API access (store only a hash of each key).
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key_hash TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys(user_id);
  `);
}

function handle() {
  if (!db) throw new Error("auth DB not initialized");
  return db;
}

module.exports = { init, handle };
