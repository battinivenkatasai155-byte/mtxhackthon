import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { db, transaction, today, getJwtSecret, DATA_DIR } from "./db.js";

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
  return (req, res, next) => {
    try {
      const payload = jwt.verify(req.cookies[COOKIE] || "", JWT_SECRET);
      // Role and existence are always re-read from the database, never trusted from the token alone.
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
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
  u.role === "admin"
    ? { id: u.id, name: u.name, email: u.email, designation: u.designation }
    : { id: u.id, name: u.name, email: u.email, mobile: u.mobile, ward: u.ward, joined: u.created_at.slice(0, 10) };

// --- data helpers ---
function notify(recipient, text) {
  db.prepare("INSERT INTO notifications (recipient, text, date) VALUES (?, ?, ?)").run(recipient, text, today());
}

function loadComplaints(citizenId) {
  const rows = citizenId
    ? db.prepare("SELECT * FROM complaints WHERE citizen_id = ? ORDER BY seq DESC").all(citizenId)
    : db.prepare("SELECT * FROM complaints ORDER BY seq DESC").all();
  const ids = new Set(rows.map((r) => r.id));
  const group = (table) => {
    const map = new Map();
    for (const r of db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()) {
      if (!ids.has(r.complaint_id)) continue;
      if (!map.has(r.complaint_id)) map.set(r.complaint_id, []);
      map.get(r.complaint_id).push(r);
    }
    return map;
  };
  const timeline = group("timeline");
  const notes = group("notes");
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

function loadNotifications(recipient) {
  return db
    .prepare("SELECT * FROM notifications WHERE recipient = ? ORDER BY id DESC LIMIT 100")
    .all(recipient)
    .map((n) => ({ id: String(n.id), to: n.recipient, text: n.text, date: n.date, read: !!n.read }));
}

// --- auth routes ---
app.post("/api/auth/register", (req, res) => {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  const mobile = str(req.body.mobile, 10);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (name.length < 3) return fail(res, 400, "Enter your full name (at least 3 characters).", "name");
  if (!EMAIL_RE.test(email)) return fail(res, 400, "Enter a valid email address.", "email");
  if (!MOBILE_RE.test(mobile)) return fail(res, 400, "Enter a valid 10-digit mobile number.", "mobile");
  if (password.length < 8 || password.length > 128) return fail(res, 400, "Password must be 8 to 128 characters.", "password");

  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return fail(res, 409, "An account with this email already exists.", "email");
  if (db.prepare("SELECT 1 FROM users WHERE mobile = ?").get(mobile)) return fail(res, 409, "An account with this mobile number already exists.", "mobile");

  const id = `C-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  db.prepare("INSERT INTO users (id, role, name, email, mobile, password_hash, created_at) VALUES (?, 'citizen', ?, ?, ?, ?, ?)").run(
    id,
    name,
    email,
    mobile,
    bcrypt.hashSync(password, 12),
    new Date().toISOString()
  );
  res.status(201).json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
  const portal = req.body.portal === "admin" ? "admin" : "citizen";
  const identifier = str(req.body.identifier, 120);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const key = `${req.ip}|${portal}|${identifier.toLowerCase()}`;

  if (throttled(key)) return fail(res, 429, "Too many failed attempts. Please wait 15 minutes and try again.");
  if (!identifier || !password) return fail(res, 400, "Enter your identifier and password.");

  const user =
    portal === "admin"
      ? db.prepare("SELECT * FROM users WHERE role = 'admin' AND (id = ? COLLATE NOCASE OR email = ? COLLATE NOCASE)").get(identifier, identifier)
      : db.prepare("SELECT * FROM users WHERE role = 'citizen' AND (email = ? OR mobile = ?)").get(identifier.toLowerCase(), identifier.replace(/[\s-]/g, ""));

  const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH) && !!user;
  if (!ok) {
    recordFailure(key);
    return fail(
      res,
      401,
      portal === "admin"
        ? "Access denied. These credentials are not authorised for the Administration Portal."
        : "Sign-in failed. Check your email or mobile number and password."
    );
  }
  attempts.delete(key);
  startSession(res, user);
  res.json({ role: user.role, user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", auth(), (req, res) => res.json({ role: req.user.role, user: publicUser(req.user) }));

app.patch("/api/me", auth("citizen"), (req, res) => {
  const name = str(req.body.name, 80);
  const mobile = str(req.body.mobile, 10);
  const ward = str(req.body.ward, 60);
  if (name.length < 3) return fail(res, 400, "Enter your full name (at least 3 characters).", "name");
  if (!MOBILE_RE.test(mobile)) return fail(res, 400, "Enter a valid 10-digit mobile number.", "mobile");
  if (db.prepare("SELECT 1 FROM users WHERE mobile = ? AND id != ?").get(mobile, req.user.id)) return fail(res, 409, "This mobile number is already in use.", "mobile");
  db.prepare("UPDATE users SET name = ?, mobile = ?, ward = ? WHERE id = ?").run(name, mobile, ward, req.user.id);
  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)) });
});

app.get("/api/public-stats", (req, res) => {
  const c = db.prepare("SELECT COUNT(*) AS received, COALESCE(SUM(status = 'Resolved'), 0) AS resolved FROM complaints").get();
  const d = db.prepare("SELECT COUNT(*) AS n FROM departments").get();
  res.json({ received: c.received, resolved: c.resolved, departments: d.n });
});

// --- application data ---
app.get("/api/bootstrap", auth(), (req, res) => {
  const departments = db.prepare("SELECT name, head FROM departments ORDER BY rowid").all();
  if (req.user.role === "admin") {
    const citizens = db
      .prepare("SELECT id, name, email, mobile, ward, created_at FROM users WHERE role = 'citizen' ORDER BY created_at")
      .all()
      .map((c) => ({ id: c.id, name: c.name, email: c.email, mobile: c.mobile, ward: c.ward, joined: c.created_at.slice(0, 10) }));
    return res.json({ departments, complaints: loadComplaints(), citizens, notifications: loadNotifications("admin") });
  }
  res.json({ departments, complaints: loadComplaints(req.user.id), citizens: [], notifications: loadNotifications(req.user.id) });
});

app.post("/api/complaints", auth("citizen"), (req, res) => {
  const title = str(req.body.title, 120);
  const description = str(req.body.description, 2000);
  const category = str(req.body.category, 80);
  const location = str(req.body.location, 120);
  const date = str(req.body.date, 10);
  let department = str(req.body.department, 80);

  if (title.length < 5) return fail(res, 400, "Title must be at least 5 characters.", "title");
  if (description.length < 20) return fail(res, 400, "Description must be at least 20 characters.", "description");
  if (!CATEGORY_DEPARTMENT[category]) return fail(res, 400, "Select a valid category.", "category");
  if (!db.prepare("SELECT 1 FROM departments WHERE name = ?").get(department)) department = CATEGORY_DEPARTMENT[category];
  if (location.length < 3) return fail(res, 400, "Enter the location or ward.", "location");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return fail(res, 400, "Enter a valid date.", "date");
  if (date > today()) return fail(res, 400, "The date cannot be in the future.", "date");

  const id = transaction(() => {
    const max = db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id, 5) AS INTEGER)), 1000) AS m FROM complaints").get().m;
    const newId = `GIQ-${max + 1}`;
    db.prepare(
      "INSERT INTO complaints (id, citizen_id, title, description, category, department, location, date, status, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', 'Medium', ?)"
    ).run(newId, req.user.id, title, description, category, department, location, date, new Date().toISOString());
    db.prepare("INSERT INTO timeline (complaint_id, status, date, note) VALUES (?, 'Submitted', ?, 'Complaint submitted by the citizen.')").run(newId, today());
    notify("admin", `New complaint ${newId} was submitted: ${title}.`);
    return newId;
  });
  res.status(201).json({ id, complaints: loadComplaints(req.user.id) });
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

app.post("/api/complaints/:id/attachment", auth("citizen"), express.raw({ type: () => true, limit: "2mb" }), (req, res) => {
  const row = db.prepare("SELECT id, attachment_name FROM complaints WHERE id = ? AND citizen_id = ?").get(req.params.id, req.user.id);
  if (!row) return fail(res, 404, "Complaint not found.");
  if (row.attachment_name) return fail(res, 409, "This complaint already has an attachment.");
  if (!Buffer.isBuffer(req.body) || !detectType(req.body)) return fail(res, 400, "Attach a JPG, PNG or PDF file (up to 2 MB).");
  const name = str(req.query.name, 120).replace(/[^\w.\- ]/g, "_") || "attachment";
  fs.writeFileSync(uploadPath(row.id), req.body);
  db.prepare("UPDATE complaints SET attachment_name = ? WHERE id = ?").run(name, row.id);
  res.json({ complaints: loadComplaints(req.user.id) });
});

app.get("/api/complaints/:id/attachment", auth(), (req, res) => {
  const row = db.prepare("SELECT id, citizen_id, attachment_name FROM complaints WHERE id = ?").get(req.params.id);
  if (!row || !row.attachment_name || (req.user.role === "citizen" && row.citizen_id !== req.user.id)) return fail(res, 404, "Attachment not found.");
  const file = uploadPath(row.id);
  if (!fs.existsSync(file)) return fail(res, 404, "Attachment not found.");
  const buf = fs.readFileSync(file);
  res.set({ "Content-Type": detectType(buf) || "application/octet-stream", "Content-Disposition": `attachment; filename="${row.attachment_name}"` });
  res.send(buf);
});

app.patch("/api/complaints/:id", auth("admin"), (req, res) => {
  const current = db.prepare("SELECT * FROM complaints WHERE id = ?").get(req.params.id);
  if (!current) return fail(res, 404, "Complaint not found.");

  const status = str(req.body.status, 20) || current.status;
  const priority = str(req.body.priority, 10) || current.priority;
  const department = str(req.body.department, 80) || current.department;
  const note = str(req.body.note, 500);

  if (!STATUSES.includes(status)) return fail(res, 400, "Invalid status.", "status");
  if (!PRIORITIES.includes(priority)) return fail(res, 400, "Invalid priority.", "priority");
  if (!db.prepare("SELECT 1 FROM departments WHERE name = ?").get(department)) return fail(res, 400, "Unknown department.", "department");

  const statusChanged = status !== current.status;
  const deptChanged = department !== current.department;
  const priorityChanged = priority !== current.priority;
  if (!statusChanged && !deptChanged && !priorityChanged && !note) return res.json({ changed: false, complaints: loadComplaints() });

  transaction(() => {
    const d = today();
    const addTimeline = (st, text) => db.prepare("INSERT INTO timeline (complaint_id, status, date, note) VALUES (?, ?, ?, ?)").run(current.id, st, d, text);
    if (deptChanged) addTimeline(statusChanged ? status : current.status, `Assigned to ${department}.`);
    if (priorityChanged) addTimeline(statusChanged ? status : current.status, `Priority set to ${priority}.`);
    if (statusChanged) addTimeline(status, note || `Status changed to ${status}.`);
    else if (note) addTimeline(current.status, `Administrative note: ${note}`);
    if (note) db.prepare("INSERT INTO notes (complaint_id, text, date) VALUES (?, ?, ?)").run(current.id, note, d);
    db.prepare("UPDATE complaints SET status = ?, priority = ?, department = ? WHERE id = ?").run(status, priority, department, current.id);
    if (statusChanged) notify(current.citizen_id, `Your complaint ${current.id} is now ${status}.`);
  });
  res.json({ changed: true, complaints: loadComplaints() });
});

app.post("/api/departments", auth("admin"), (req, res) => {
  const name = str(req.body.name, 80);
  const head = str(req.body.head, 80);
  if (name.length < 3) return fail(res, 400, "Enter a department name (at least 3 characters).", "name");
  if (db.prepare("SELECT 1 FROM departments WHERE name = ? COLLATE NOCASE").get(name)) return fail(res, 409, "This department already exists.", "name");
  db.prepare("INSERT INTO departments (name, head) VALUES (?, ?)").run(name, head);
  res.status(201).json({ departments: db.prepare("SELECT name, head FROM departments ORDER BY rowid").all() });
});

app.post("/api/notifications/read", auth(), (req, res) => {
  const recipient = req.user.role === "admin" ? "admin" : req.user.id;
  db.prepare("UPDATE notifications SET read = 1 WHERE recipient = ?").run(recipient);
  res.json({ notifications: loadNotifications(recipient) });
});

app.use("/api", (req, res) => fail(res, 404, "Not found."));

// --- serve the built frontend in production ---
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err, req, res, next) => {
  console.error(err);
  fail(res, err.status || 500, err.status === 400 ? "Invalid request." : "Something went wrong. Please try again.");
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`GrievanceIQ server listening on http://localhost:${port}`));
