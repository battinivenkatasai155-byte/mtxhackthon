import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { all, get, run, transaction, today, getJwtSecret, DATA_DIR } from "./db.js";

const STATUSES = ["Submitted", "Under Review", "In Progress", "Resolved", "Rejected"];
const PRIORITIES = ["Low", "Medium", "High"];
const CATEGORY_DEPARTMENT = {
  "Roads and Infrastructure": "Public Works Department",
  "Water Supply": "Water Supply Board",
  "Sanitation and Waste Management": "Sanitation Department",
  Streetlights: "Electrical Services",
  "Public Safety": "Public Safety Cell",
  "Other Civic Services": "General Administration",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^[6-9]\d{9}$/;
const EMPLOYEE_RE = /^ADM-\d{4}$/i;
const isProd = process.env.NODE_ENV === "production";
const JWT_SECRET = getJwtSecret();
const COOKIE = "giq_session";
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "50kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Cache-Control": req.path.startsWith("/api") ? "no-store" : "public, max-age=300",
  });
  next();
});

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const fail = (res, code, message, field) => res.status(code).json({ error: message, field });

// --- login throttling (in memory; use a shared store when running several instances) ---
const attempts = new Map();
function throttled(key) {
  const now = Date.now();
  const e = attempts.get(key);
  if (!e || e.reset < now) return false;
  return e.count >= 8;
}
function recordFailure(key) {
  const now = Date.now();
  const e = attempts.get(key);
  if (!e || e.reset < now) attempts.set(key, { count: 1, reset: now + 15 * 60 * 1000 });
  else e.count += 1;
}

// --- sessions ---
function startSession(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "strict", secure: isProd, maxAge: 8 * 60 * 60 * 1000, path: "/" });
}

function auth(role) {
  return async (req, res, next) => {
    try {
      const payload = jwt.verify(req.cookies[COOKIE] || "", JWT_SECRET);
      // Role and existence are always re-read from the database, never trusted from the token alone.
      const user = await get("SELECT * FROM users WHERE id = $1", [payload.sub]);
      if (!user || user.role !== payload.role) throw new Error("invalid");
      if (role && user.role !== role) return fail(res, 403, "You do not have permission to perform this action.");
      req.user = user;
      next();
    } catch {
      fail(res, 401, "Please sign in to continue.");
    }
  };
}

const publicUser = (u) =>
  u.role === "admin" || u.role === "central"
    ? { id: u.id, name: u.name, email: u.email, designation: u.designation }
    : { id: u.id, name: u.name, email: u.email, mobile: u.mobile, ward: u.ward, joined: u.created_at.slice(0, 10) };

// --- data helpers ---
function notify(recipient, text, ex) {
  return run("INSERT INTO notifications (recipient, text, date) VALUES ($1, $2, $3)", [recipient, text, today()], ex);
}

async function loadComplaints(citizenId) {
  const rows = citizenId
    ? await all("SELECT * FROM complaints WHERE citizen_id = $1 ORDER BY seq DESC", [citizenId])
    : await all("SELECT * FROM complaints ORDER BY seq DESC");
  const ids = new Set(rows.map((r) => r.id));
  const group = async (table) => {
    const map = new Map();
    for (const r of await all(`SELECT * FROM ${table} ORDER BY id`)) {
      if (!ids.has(r.complaint_id)) continue;
      if (!map.has(r.complaint_id)) map.set(r.complaint_id, []);
      map.get(r.complaint_id).push(r);
    }
    return map;
  };
  const timeline = await group("timeline");
  const notes = await group("notes");
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    department: r.department,
    location: r.location,
    date: r.date,
    status: r.status,
    priority: r.priority,
    citizenId: r.citizen_id,
    attachmentName: r.attachment_name,
    timeline: (timeline.get(r.id) || []).map((t) => ({ status: t.status, date: t.date, note: t.note })),
    notes: (notes.get(r.id) || []).map((n) => ({ text: n.text, date: n.date })),
  }));
}

async function loadNotifications(recipient) {
  return (await all("SELECT * FROM notifications WHERE recipient = $1 ORDER BY id DESC LIMIT 100", [recipient])).map((n) => ({ id: String(n.id), to: n.recipient, text: n.text, date: n.date, read: n.read }));
}

// --- auth routes ---
app.post("/api/auth/register", async (req, res) => {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  const mobile = str(req.body.mobile, 10);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (name.length < 3) return fail(res, 400, "Enter your full name (at least 3 characters).", "name");
  if (!EMAIL_RE.test(email)) return fail(res, 400, "Enter a valid email address.", "email");
  if (!MOBILE_RE.test(mobile)) return fail(res, 400, "Enter a valid 10-digit mobile number.", "mobile");
  if (password.length < 8 || password.length > 128) return fail(res, 400, "Password must be 8 to 128 characters.", "password");

  if (await get("SELECT 1 FROM users WHERE lower(email) = $1", [email])) return fail(res, 409, "An account with this email already exists.", "email");
  if (await get("SELECT 1 FROM users WHERE mobile = $1", [mobile])) return fail(res, 409, "An account with this mobile number already exists.", "mobile");

  const id = `C-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  try {
    await run("INSERT INTO users (id, role, name, email, mobile, password_hash, created_at) VALUES ($1, 'citizen', $2, $3, $4, $5, $6)", [
      id,
      name,
      email,
      mobile,
      bcrypt.hashSync(password, 12),
      new Date().toISOString(),
    ]);
  } catch (err) {
    if (err.code !== "23505") throw err;
    return fail(res, 409, "An account with this email or mobile number already exists.");
  }
  res.status(201).json({ ok: true });
});

// Only emails on this list (ADMIN_EMAILS env var, or one per line in <DATA_DIR>/admin-emails.txt) may create an administrator account; capped at 10.
const MAX_ADMINS = 10;
function adminAllowlist() {
  const file = path.join(DATA_DIR, "admin-emails.txt");
  const raw = [process.env.ADMIN_EMAILS || "", fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""].join("\n");
  return [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))].slice(0, MAX_ADMINS);
}

app.post("/api/auth/admin-register", async (req, res) => {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (name.length < 3) return fail(res, 400, "Enter your full name (at least 3 characters).", "name");
  if (!EMAIL_RE.test(email)) return fail(res, 400, "Enter a valid email address.", "email");
  if (password.length < 10 || password.length > 128) return fail(res, 400, "Password must be 10 to 128 characters.", "password");
  if (!adminAllowlist().includes(email)) return fail(res, 403, "This email is not authorised for administrator access.", "email");
  if (await get("SELECT 1 FROM users WHERE lower(email) = $1", [email])) return fail(res, 409, "An account with this email already exists.", "email");
  const id = `ADM-${crypto.randomInt(1000, 10000)}`;
  try {
    await run("INSERT INTO users (id, role, name, email, mobile, designation, password_hash, created_at) VALUES ($1, 'admin', $2, $3, NULL, 'Grievance Officer', $4, $5)", [
      id, name, email, bcrypt.hashSync(password, 12), new Date().toISOString(),
    ]);
  } catch (err) {
    if (err.code !== "23505") throw err;
    return fail(res, 409, "Could not create the account. Please try again.");
  }
  res.status(201).json({ ok: true, id });
});

app.post("/api/auth/login", async (req, res) => {
  const portal = ["admin", "central"].includes(req.body.portal) ? req.body.portal : "citizen";
  const identifier = str(req.body.identifier, 120);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const key = `${req.ip}|${portal}|${identifier.toLowerCase()}`;

  if (throttled(key)) return fail(res, 429, "Too many failed attempts. Please wait 15 minutes and try again.");
  if (!identifier || !password) return fail(res, 400, "Enter your identifier and password.");

  const user =
    portal === "admin" || portal === "central"
      ? await get("SELECT * FROM users WHERE role = $2 AND (lower(id) = lower($1) OR lower(email) = lower($1))", [identifier, portal])
      : await get("SELECT * FROM users WHERE role = 'citizen' AND (lower(email) = $1 OR mobile = $2)", [identifier.toLowerCase(), identifier.replace(/[\s-]/g, "")]);

  const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH) && !!user;
  if (!ok) {
    recordFailure(key);
    return fail(
      res,
      401,
      portal === "admin"
        ? "Access denied. These credentials are not authorised for the Administration Portal."
        : portal === "central"
        ? "Access denied. These credentials are not authorised for the Central Government Portal."
        : "Sign-in failed. Check your email or mobile number and password."
    );
  }
  attempts.delete(key);
  startSession(res, user);
  res.json({ role: user.role, user: publicUser(user) });
});

app.post("/api/auth/logout", async (req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", auth(), async (req, res) => res.json({ role: req.user.role, user: publicUser(req.user) }));

app.patch("/api/me", auth("citizen"), async (req, res) => {
  const name = str(req.body.name, 80);
  const mobile = str(req.body.mobile, 10);
  const ward = str(req.body.ward, 60);
  if (name.length < 3) return fail(res, 400, "Enter your full name (at least 3 characters).", "name");
  if (!MOBILE_RE.test(mobile)) return fail(res, 400, "Enter a valid 10-digit mobile number.", "mobile");
  if (await get("SELECT 1 FROM users WHERE mobile = $1 AND id != $2", [mobile, req.user.id])) return fail(res, 409, "This mobile number is already in use.", "mobile");
  await run("UPDATE users SET name = $1, mobile = $2, ward = $3 WHERE id = $4", [name, mobile, ward, req.user.id]);
  res.json({ user: publicUser(await get("SELECT * FROM users WHERE id = $1", [req.user.id])) });
});

app.get("/api/public-stats", async (req, res) => {
  const c = await get("SELECT COUNT(*)::int AS received, COUNT(*) FILTER (WHERE status = 'Resolved')::int AS resolved FROM complaints");
  const d = await get("SELECT COUNT(*)::int AS n FROM departments");
  res.json({ received: c.received, resolved: c.resolved, departments: d.n });
});

// --- application data ---
app.get("/api/bootstrap", auth(), async (req, res) => {
  const departments = await all("SELECT name, head FROM departments ORDER BY pos");
  if (req.user.role === "admin" || req.user.role === "central") {
    const citizens = (await all("SELECT id, name, email, mobile, ward, created_at FROM users WHERE role = 'citizen' ORDER BY created_at")).map((c) => ({ id: c.id, name: c.name, email: c.email, mobile: c.mobile, ward: c.ward, joined: c.created_at.slice(0, 10) }));
    return res.json({ departments, complaints: await loadComplaints(), citizens, notifications: req.user.role === "admin" ? await loadNotifications("admin") : [] });
  }
  res.json({ departments, complaints: await loadComplaints(req.user.id), citizens: [], notifications: await loadNotifications(req.user.id) });
});

app.post("/api/complaints", auth("citizen"), async (req, res) => {
  const title = str(req.body.title, 120);
  const description = str(req.body.description, 2000);
  const category = str(req.body.category, 80);
  const location = str(req.body.location, 120);
  const date = str(req.body.date, 10);
  let department = str(req.body.department, 80);

  if (title.length < 5) return fail(res, 400, "Title must be at least 5 characters.", "title");
  if (description && description.length < 20) return fail(res, 400, "Description must be at least 20 characters if provided.", "description");
  if (!CATEGORY_DEPARTMENT[category]) return fail(res, 400, "Select a valid category.", "category");
  if (!(await get("SELECT 1 FROM departments WHERE name = $1", [department]))) department = CATEGORY_DEPARTMENT[category];
  if (location.length < 3) return fail(res, 400, "Enter the location or ward.", "location");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return fail(res, 400, "Enter a valid date.", "date");
  if (date > today()) return fail(res, 400, "The date cannot be in the future.", "date");

  const id = await transaction(async (c) => {
    await run("SELECT pg_advisory_xact_lock(1001)", [], c);
    const max = (await get("SELECT COALESCE(MAX(CAST(SUBSTR(id, 5) AS INTEGER)), 1000)::int AS m FROM complaints", [], c)).m;
    const newId = `GIQ-${max + 1}`;
    await run(
      "INSERT INTO complaints (id, citizen_id, title, description, category, department, location, date, status, priority, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Submitted', 'Medium', $9)",
      [newId, req.user.id, title, description, category, department, location, date, new Date().toISOString()],
      c
    );
    await run("INSERT INTO timeline (complaint_id, status, date, note) VALUES ($1, 'Submitted', $2, 'Complaint submitted by the citizen.')", [newId, today()], c);
    await notify("admin", `New complaint ${newId} was submitted: ${title}.`, c);
    return newId;
  });
  res.status(201).json({ id, complaints: await loadComplaints(req.user.id) });
});

const MAGIC = [
  { type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "application/pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
];
const detectType = (buf) => MAGIC.find((m) => buf.length > 8 && m.test(buf))?.type;
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const uploadPath = (id) => path.join(UPLOAD_DIR, `${id}.bin`);

app.post("/api/complaints/:id/attachment", auth("citizen"), express.raw({ type: () => true, limit: "2mb" }), async (req, res) => {
  const row = await get("SELECT id, attachment_name FROM complaints WHERE id = $1 AND citizen_id = $2", [req.params.id, req.user.id]);
  if (!row) return fail(res, 404, "Complaint not found.");
  if (row.attachment_name) return fail(res, 409, "This complaint already has an attachment.");
  if (!Buffer.isBuffer(req.body) || !detectType(req.body)) return fail(res, 400, "Attach a JPG, PNG or PDF file (up to 2 MB).");
  const name = str(req.query.name, 120).replace(/[^\w.\- ]/g, "_") || "attachment";
  fs.writeFileSync(uploadPath(row.id), req.body);
  await run("UPDATE complaints SET attachment_name = $1 WHERE id = $2", [name, row.id]);
  res.json({ complaints: await loadComplaints(req.user.id) });
});

app.get("/api/complaints/:id/attachment", auth(), async (req, res) => {
  const row = await get("SELECT id, citizen_id, attachment_name FROM complaints WHERE id = $1", [req.params.id]);
  if (!row || !row.attachment_name || (req.user.role === "citizen" && row.citizen_id !== req.user.id)) return fail(res, 404, "Attachment not found.");
  const file = uploadPath(row.id);
  if (!fs.existsSync(file)) return fail(res, 404, "Attachment not found.");
  const buf = fs.readFileSync(file);
  res.set({ "Content-Type": detectType(buf) || "application/octet-stream", "Content-Disposition": `attachment; filename="${row.attachment_name}"` });
  res.send(buf);
});

app.patch("/api/complaints/:id", auth("admin"), async (req, res) => {
  const current = await get("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
  if (!current) return fail(res, 404, "Complaint not found.");

  const status = str(req.body.status, 20) || current.status;
  const priority = str(req.body.priority, 10) || current.priority;
  const department = str(req.body.department, 80) || current.department;
  const note = str(req.body.note, 500);

  if (!STATUSES.includes(status)) return fail(res, 400, "Invalid status.", "status");
  if (!PRIORITIES.includes(priority)) return fail(res, 400, "Invalid priority.", "priority");
  if (!(await get("SELECT 1 FROM departments WHERE name = $1", [department]))) return fail(res, 400, "Unknown department.", "department");

  const statusChanged = status !== current.status;
  const deptChanged = department !== current.department;
  const priorityChanged = priority !== current.priority;
  if (!statusChanged && !deptChanged && !priorityChanged && !note) return res.json({ changed: false, complaints: await loadComplaints() });

  await transaction(async (c) => {
    const d = today();
    const addTimeline = (st, text) => run("INSERT INTO timeline (complaint_id, status, date, note) VALUES ($1, $2, $3, $4)", [current.id, st, d, text], c);
    if (deptChanged) await addTimeline(statusChanged ? status : current.status, `Assigned to ${department}.`);
    if (priorityChanged) await addTimeline(statusChanged ? status : current.status, `Priority set to ${priority}.`);
    if (statusChanged) await addTimeline(status, note || `Status changed to ${status}.`);
    else if (note) await addTimeline(current.status, `Administrative note: ${note}`);
    if (note) await run("INSERT INTO notes (complaint_id, text, date) VALUES ($1, $2, $3)", [current.id, note, d], c);
    await run("UPDATE complaints SET status = $1, priority = $2, department = $3 WHERE id = $4", [status, priority, department, current.id], c);
    if (statusChanged) await notify(current.citizen_id, `Your complaint ${current.id} is now ${status}.`, c);
  });
  res.json({ changed: true, complaints: await loadComplaints() });
});

app.post("/api/departments", auth("admin"), async (req, res) => {
  const name = str(req.body.name, 80);
  const head = str(req.body.head, 80);
  if (name.length < 3) return fail(res, 400, "Enter a department name (at least 3 characters).", "name");
  if (await get("SELECT 1 FROM departments WHERE lower(name) = lower($1)", [name])) return fail(res, 409, "This department already exists.", "name");
  await run("INSERT INTO departments (name, head) VALUES ($1, $2)", [name, head]);
  res.status(201).json({ departments: await all("SELECT name, head FROM departments ORDER BY pos") });
});

app.post("/api/notifications/read", auth(), async (req, res) => {
  const recipient = req.user.role === "admin" ? "admin" : req.user.id;
  await run("UPDATE notifications SET read = TRUE WHERE recipient = $1", [recipient]);
  res.json({ notifications: await loadNotifications(recipient) });
});

app.use("/api", (req, res) => fail(res, 404, "Not found."));

// --- serve the built frontend in production ---
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, async (req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err, req, res, next) => {
  console.error(err);
  fail(res, err.status || 500, err.status === 400 ? "Invalid request." : "Something went wrong. Please try again.");
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`GrievanceIQ server listening on http://localhost:${port}`));
