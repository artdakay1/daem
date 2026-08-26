import "dotenv/config";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(process.env.DB_FILE || path.join(dataDir, "daem.sqlite"));
db.pragma("journal_mode = WAL");
db.exec("CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, sss_no TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
try { db.exec("ALTER TABLE records ADD COLUMN member_id INTEGER"); } catch (error) { if (!error.message.includes("duplicate column name")) throw error; }

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(session({ secret: process.env.MEMBER_SESSION_SECRET || process.env.SESSION_SECRET || "local-member-secret-change-me", resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 } }));
function requireMember(req, res, next) { if (!req.session.member) return res.status(401).json({ error: "Member login required" }); next(); }
function audit(action) { const admin = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get(); if (admin) db.prepare("INSERT INTO audit_log (user_id, action) VALUES (?, ?)").run(admin.id, `member portal: ${action}`); }
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "member.html")));
app.post("/api/member/register", (req, res) => {
  const username = String(req.body.username || "").trim(); const password = String(req.body.password || ""); const name = String(req.body.name || "").trim(); const sssNo = String(req.body.sssNo || "").trim();
  if (!username || password.length < 8 || !name || !sssNo) return res.status(400).json({ error: "Username, name, SSS number, and an 8-character password are required" });
  try { const result = db.prepare("INSERT INTO members (username, password_hash, name, sss_no) VALUES (?, ?, ?, ?)").run(username, bcrypt.hashSync(password, 12), name, sssNo); req.session.member = { id: result.lastInsertRowid, username, name, sssNo }; res.status(201).json(req.session.member); } catch (error) { res.status(409).json({ error: error.message.includes("UNIQUE") ? "Username is already registered" : "Unable to register member" }); }
});
app.post("/api/member/login", (req, res) => { const member = db.prepare("SELECT * FROM members WHERE username = ?").get(String(req.body.username || "")); if (!member || !bcrypt.compareSync(String(req.body.password || ""), member.password_hash)) return res.status(401).json({ error: "Invalid member credentials" }); req.session.member = { id: member.id, username: member.username, name: member.name, sssNo: member.sss_no }; res.json(req.session.member); });
app.post("/api/member/logout", requireMember, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/member/session", (req, res) => res.json({ authenticated: Boolean(req.session.member), member: req.session.member || null }));
app.get("/api/member/submissions", requireMember, (req, res) => res.json(db.prepare("SELECT item_no, name, sss_no, account_type, account_number, status, rejection_reason, date_enrolled, date_reviewed, processing_days FROM records WHERE member_id = ? ORDER BY item_no DESC").all(req.session.member.id)));
app.post("/api/member/submissions", requireMember, (req, res) => {
  const clientName = String(req.body.clientName || "").trim(); const clientSss = String(req.body.clientSss || "").trim(); const accountType = String(req.body.accountType || "").trim(); const accountNumber = String(req.body.accountNumber || "").trim();
  if (!clientName || !clientSss || !accountType || !accountNumber) return res.status(400).json({ error: "Client name, SSS number, account type, and account number are required" });
  const enrolled = new Date().toISOString().slice(0, 10); const itemNo = Number(db.prepare("SELECT COALESCE(MAX(item_no), 10000) + 1 next_item FROM records").get().next_item); const month = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());
  db.prepare("INSERT INTO records (item_no, member_id, name, sss_no, account_type, account_number, status, rejection_reason, date_enrolled, date_reviewed, processing_days, enrollment_month, enrollment_year, duplicate_flag) VALUES (?, ?, ?, ?, ?, ?, 'Submitted', NULL, ?, '', 0, ?, ?, NULL)").run(itemNo, req.session.member.id, clientName, clientSss, accountType, accountNumber, enrolled, month, new Date().getUTCFullYear());
  audit(`submitted record ${itemNo}`); res.status(201).json(db.prepare("SELECT * FROM records WHERE item_no = ?").get(itemNo));
});
app.patch("/api/member/submissions/:itemNo", requireMember, (req, res) => { const clientName = String(req.body.clientName || "").trim(); const clientSss = String(req.body.clientSss || "").trim(); const accountType = String(req.body.accountType || "").trim(); const accountNumber = String(req.body.accountNumber || "").trim(); if (!clientName || !clientSss || !accountType || !accountNumber) return res.status(400).json({ error: "All submission fields are required" }); const result = db.prepare("UPDATE records SET name = ?, sss_no = ?, account_type = ?, account_number = ?, status = 'Submitted', rejection_reason = NULL WHERE item_no = ? AND member_id = ? AND status IN ('Rejected', 'Correction Required')").run(clientName, clientSss, accountType, accountNumber, Number(req.params.itemNo), req.session.member.id); if (!result.changes) return res.status(404).json({ error: "Submission not found or cannot be corrected" }); audit(`member ${req.session.member.username} corrected record ${req.params.itemNo}`); res.json(db.prepare("SELECT * FROM records WHERE item_no = ? AND member_id = ?").get(Number(req.params.itemNo), req.session.member.id)); });

const port = Number(process.env.MEMBER_PORT || 3002);
app.listen(port, () => console.log(`DAEM member server listening on http://localhost:${port}`));
