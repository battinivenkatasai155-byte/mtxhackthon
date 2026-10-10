import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR now only holds uploaded attachments and the generated JWT secret.
export const DATA_DIR = process.env.DATA_DIR || path.join(here, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// Connects with DATABASE_URL, or the standard PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE variables.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  max: Number(process.env.PG_POOL_MAX) || 10,
});

export const all = async (sql, params = [], ex = pool) => (await ex.query(sql, params)).rows;
export const get = async (sql, params = [], ex = pool) => (await ex.query(sql, params)).rows[0];
export const run = async (sql, params = [], ex = pool) => ex.query(sql, params);

await run(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('citizen','admin')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT UNIQUE,
  ward TEXT NOT NULL DEFAULT '',
  designation TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));
CREATE TABLE IF NOT EXISTS departments (
  pos SERIAL,
  name TEXT PRIMARY KEY,
  head TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS complaints (
  seq BIGSERIAL PRIMARY KEY,
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
  id BIGSERIAL PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id),
  status TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id),
  text TEXT NOT NULL,
  date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient TEXT NOT NULL,
  text TEXT NOT NULL,
  date TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('citizen','admin','central'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_central ON users (role) WHERE role = 'central';
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
for (const d of DEFAULT_DEPARTMENTS) await run("INSERT INTO departments (name, head) VALUES ($1, '') ON CONFLICT DO NOTHING", [d]);

export const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// JWT signing secret: from the environment, otherwise generated once and kept next to the database.
export function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, ".jwt-secret");
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(file, "utf8").trim();
}
