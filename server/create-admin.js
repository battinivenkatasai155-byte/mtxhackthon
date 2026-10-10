// Usage: npm run create-admin -- --id ADM-1001 --email name@org.gov --name "Full Name" --designation "Grievance Officer" --password "<strong password>"
// Administrator accounts can only be created from the server command line, never from the public website.
import bcrypt from "bcryptjs";
import { db } from "./db.js";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const { id, email, name, designation = "Grievance Officer", password } = args;
if (!id || !email || !name || !password) {
  console.error('Required: --id ADM-1001 --email you@org.gov --name "Full Name" --password "<min 10 chars>" [--designation "..."]');
  process.exit(1);
}
if (!/^ADM-\d{4}$/i.test(id)) {
  console.error("Employee ID must look like ADM-1234.");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const existing = db.prepare("SELECT id FROM users WHERE id = ? COLLATE NOCASE AND role = 'admin'").get(id);
if (existing) {
  db.prepare("UPDATE users SET name=?, email=?, designation=?, password_hash=? WHERE id=?").run(name, email, designation, hash, existing.id);
  console.log(`Updated administrator ${existing.id}.`);
} else {
  db.prepare(
    "INSERT INTO users (id, role, name, email, mobile, designation, password_hash, created_at) VALUES (?, 'admin', ?, ?, NULL, ?, ?, ?)"
  ).run(id.toUpperCase(), name, email, designation, hash, new Date().toISOString());
  console.log(`Created administrator ${id.toUpperCase()}.`);
}
