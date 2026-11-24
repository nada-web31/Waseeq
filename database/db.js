const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, 'waseeq.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

function open() {
  try {
    // Built into Node 22.13+ (no native build needed)
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(DB_PATH);
  } catch (e) {
    try {
      const Database = require('better-sqlite3');
      return new Database(DB_PATH);
    } catch (e2) {
      console.error('\nNo SQLite driver available. Use Node.js 22.13+ or run: npm install better-sqlite3\n');
      process.exit(1);
    }
  }
}

const db = open();
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  invoice_number TEXT NOT NULL DEFAULT '',
  seller_name TEXT NOT NULL DEFAULT '',
  vat_number TEXT NOT NULL DEFAULT '',
  invoice_date TEXT NOT NULL DEFAULT '',
  total REAL,
  vat_amount REAL,
  qr_raw TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT '',
  file_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  checks_json TEXT NOT NULL DEFAULT '[]',
  review_status TEXT NOT NULL DEFAULT 'none',
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ver_user ON verifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ver_number ON verifications(invoice_number);
CREATE INDEX IF NOT EXISTS idx_ver_fp ON verifications(fingerprint);
CREATE INDEX IF NOT EXISTS idx_ver_file ON verifications(file_hash);
`);
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());

module.exports = { db, now: () => new Date().toISOString() };
