import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(here, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "grievanceiq.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('citizen','admin')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mobile TEXT UNIQUE,
  ward TEXT NOT NULL DEFAULT '',
  designation TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS departments (
  name TEXT PRIMARY KEY,
  head TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS complaints (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  citizen_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  department TEXT NOT NULL,
  location TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  attachment_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id TEXT NOT NULL REFERENCES complaints(id),
  status TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id TEXT NOT NULL REFERENCES complaints(id),
  text TEXT NOT NULL,
  date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,
  text TEXT NOT NULL,
  date TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_complaints_citizen ON complaints(citizen_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient);
`);

export const DEFAULT_DEPARTMENTS = [
  "Public Works Department",
  "Water Supply Board",
  "Sanitation Department",
  "Electrical Services",
  "Public Safety Cell",
  "General Administration",
];
const seed = db.prepare("INSERT OR IGNORE INTO departments (name, head) VALUES (?, '')");
DEFAULT_DEPARTMENTS.forEach((d) => seed.run(d));

export const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// JWT signing secret: from the environment, otherwise generated once and kept next to the database.
export function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, ".jwt-secret");
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(file, "utf8").trim();
}
