// Usage: npm run create-central -- --email officer@gov.in --name "Full Name" --password "<10+ characters>"
// The Central Government portal has exactly one login. Running this again replaces that single account's details.
import bcrypt from "bcryptjs";
import { get, run, pool } from "./db.js";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const { email, name, designation = "Central Government Officer", password } = args;
if (!email || !name || !password) {
  console.error('Required: --email officer@gov.in --name "Full Name" --password "<min 10 chars>" [--designation "..."]');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Enter a valid email address.");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const existing = await get("SELECT id FROM users WHERE role = 'central'");
if (existing) {
  await run("UPDATE users SET name=$1, email=$2, designation=$3, password_hash=$4 WHERE id=$5", [name, email, designation, hash, existing.id]);
  console.log(`Updated the Central Government login (${existing.id}).`);
} else {
  await run("INSERT INTO users (id, role, name, email, mobile, designation, password_hash, created_at) VALUES ('CGOV-0001', 'central', $1, $2, NULL, $3, $4, $5)", [
    name,
    email,
    designation,
    hash,
    new Date().toISOString(),
  ]);
  console.log("Created the Central Government login (CGOV-0001).");
}
await pool.end();
