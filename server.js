import "dotenv/config";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import multer from "multer";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(
  process.env.DB_FILE || path.join(dataDir, "daem.sqlite"),
);
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin');
CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, sss_no TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS records (item_no INTEGER PRIMARY KEY, name TEXT NOT NULL, sss_no TEXT NOT NULL, account_type TEXT NOT NULL, account_number TEXT NOT NULL, status TEXT NOT NULL, rejection_reason TEXT, date_enrolled TEXT NOT NULL, date_reviewed TEXT NOT NULL, processing_days INTEGER NOT NULL, enrollment_month TEXT NOT NULL, enrollment_year INTEGER NOT NULL, duplicate_flag TEXT);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
try { db.exec("ALTER TABLE records ADD COLUMN member_id INTEGER") } catch (error) { if (!error.message.includes("duplicate column name")) throw error }
try { db.exec("ALTER TABLE members ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'Pending'") } catch (error) { if (!error.message.includes("duplicate column name")) throw error }
const username = process.env.ADMIN_USERNAME || "admin";
const password = process.env.ADMIN_PASSWORD || "change-this-before-use";
if (!db.prepare("SELECT id FROM users WHERE username = ?").get(username))
  db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(
    username,
    bcrypt.hashSync(password, 12),
  );

const app = express();
const publicDir = path.join(__dirname, "dist");
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "local-development-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);
const attempts = new Map();
const upload = multer({
  dest: path.join(dataDir, "uploads"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) =>
    callback(null, /\.(xlsx|xlsm|xls|csv)$/i.test(file.originalname)),
});
function audit(req, action) {
  if (req.session.user)
    db.prepare("INSERT INTO audit_log (user_id, action) VALUES (?, ?)").run(
      req.session.user.id,
      action,
    );
}
function requireAuth(req, res, next) {
  if (!req.session.user)
    return res.status(401).json({ error: "Authentication required" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  next();
}
function getStats(month) {
  const where =
    month && month !== "All months" ? "WHERE enrollment_month = @month" : "";
  const params = month && month !== "All months" ? { month } : {};
  const totals = db
    .prepare(
      `SELECT COUNT(*) total, SUM(status = 'Approved') approved, SUM(status = 'Rejected') rejected, ROUND(AVG(processing_days), 1) average_processing FROM records ${where}`,
    )
    .get(params);
  const monthly = db
    .prepare(
      `SELECT enrollment_month label, COUNT(*) total, SUM(status = 'Approved') approved, SUM(status = 'Rejected') rejected, ROUND(AVG(processing_days), 1) days FROM records ${where} GROUP BY enrollment_month ORDER BY MIN(date_enrolled)`,
    )
    .all(params);
  const accountTypes = db
    .prepare(
      `SELECT account_type label, COUNT(*) value FROM records ${where} GROUP BY account_type ORDER BY value DESC`,
    )
    .all(params);
  const reasonWhere = where
    ? `${where} AND status = 'Rejected'`
    : `WHERE status = 'Rejected'`;
  const reasons = db
    .prepare(
      `SELECT COALESCE(rejection_reason, 'Unspecified') label, COUNT(*) value FROM records ${reasonWhere} GROUP BY rejection_reason ORDER BY value DESC`,
    )
    .all(params);
  return { totals, monthly, accountTypes, reasons };
}
app.post("/api/login", (req, res) => {
  const key = `${req.ip}:${String(req.body.username || "").slice(0, 80)}`;
  const recent = attempts.get(key) || { count: 0, blockedUntil: 0 };
  if (Date.now() < recent.blockedUntil)
    return res
      .status(429)
      .json({ error: "Too many attempts. Try again later." });
  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(req.body.username || "");
  if (
    !user ||
    !bcrypt.compareSync(req.body.password || "", user.password_hash)
  ) {
    recent.count += 1;
    if (recent.count >= 5) {
      recent.count = 0;
      recent.blockedUntil = Date.now() + 15 * 60 * 1000;
    }
    attempts.set(key, recent);
    return res.status(401).json({ error: "Invalid credentials" });
  }
  attempts.delete(key);
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json({ username: user.username, role: user.role });
});
app.post("/api/logout", requireAuth, (req, res) =>
  req.session.destroy(() => res.json({ ok: true })),
);
app.get("/api/session", (req, res) =>
  res.json({
    authenticated: Boolean(req.session.user),
    user: req.session.user || null,
  }),
);
app.get("/api/members", requireAdmin, (req, res) => {
  audit(req, "viewed member approvals");
  res.json(db.prepare("SELECT id, username, name, sss_no, approval_status, created_at FROM members ORDER BY CASE approval_status WHEN 'Pending' THEN 0 ELSE 1 END, created_at DESC").all());
});
app.patch("/api/members/:id/approval", requireAdmin, (req, res) => {
  const approvalStatus = String(req.body.approvalStatus || "");
  if (!["Approved", "Rejected"].includes(approvalStatus)) return res.status(400).json({ error: "Approval status must be Approved or Rejected" });
  const result = db.prepare("UPDATE members SET approval_status = ? WHERE id = ?").run(approvalStatus, Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Member not found" });
  audit(req, `${approvalStatus.toLowerCase()} member account ${req.params.id}`);
  res.json(db.prepare("SELECT id, username, name, sss_no, approval_status, created_at FROM members WHERE id = ?").get(Number(req.params.id)));
});
app.get("/api/stats", requireAuth, (req, res) => {
  audit(req, "viewed dashboard");
  res.json(getStats(req.query.month));
});
app.get("/api/data-quality", requireAuth, (req, res) => {
  audit(req, "viewed data quality");
  const selectIssues = (condition) => db.prepare(`SELECT records.item_no, records.name, records.sss_no, records.account_type, records.account_number, records.status, records.date_enrolled, records.date_reviewed, records.processing_days, records.rejection_reason, members.name AS msr_name, members.username AS msr_username FROM records LEFT JOIN members ON members.id = records.member_id WHERE ${condition} ORDER BY records.item_no DESC LIMIT 100`).all();
  const issues = {
    negativeProcessing: selectIssues("records.processing_days < 0"),
    missingDates: selectIssues("records.date_enrolled = '' OR records.date_reviewed = ''"),
    duplicates: selectIssues("records.duplicate_flag IS NOT NULL AND records.duplicate_flag != ''"),
    rejectedWithoutReason: selectIssues("records.status = 'Rejected' AND (records.rejection_reason IS NULL OR records.rejection_reason = '')"),
  };
  res.json({ negativeProcessing: issues.negativeProcessing.length, missingDates: issues.missingDates.length, duplicates: issues.duplicates.length, rejectedWithoutReason: issues.rejectedWithoutReason.length, issues });
});
app.get("/api/records", requireAuth, (req, res) => {
  audit(req, "viewed records");
  const {
    q = "",
    month = "All months",
    status = "All statuses",
    accountType = "All account types",
    reason = "All reasons",
    year = "All years",
    sort = "item_no",
    direction = "desc",
    page = 1,
    pageSize = 25,
  } = req.query;
  const allowedSorts = [
    "item_no",
    "name",
    "account_type",
    "status",
    "date_enrolled",
    "date_reviewed",
    "processing_days",
  ];
  const order = allowedSorts.includes(sort) ? sort : "item_no";
  const orderDirection = direction.toLowerCase() === "asc" ? "ASC" : "DESC";
  const filters = [];
  const params = {
    q: `%${q}%`,
    offset: (Number(page) - 1) * Number(pageSize),
    limit: Number(pageSize),
  };
  if (month !== "All months") {
    filters.push("enrollment_month = @month");
    params.month = month;
  }
  if (status !== "All statuses") {
    filters.push("status = @status");
    params.status = status;
  }
  if (accountType !== "All account types") {
    filters.push("account_type = @accountType");
    params.accountType = accountType;
  }
  if (reason !== "All reasons") {
    filters.push("rejection_reason = @reason");
    params.reason = reason;
  }
  if (year !== "All years") {
    filters.push("enrollment_year = @year");
    params.year = Number(year);
  }
  filters.push("(records.name LIKE @q OR records.sss_no LIKE @q OR records.account_number LIKE @q OR members.name LIKE @q OR members.username LIKE @q)");
  const where = `WHERE ${filters.join(" AND ")}`;
  const rows = db
    .prepare(
      `SELECT records.*, members.name AS msr_name, members.username AS msr_username FROM records LEFT JOIN members ON members.id = records.member_id ${where} ORDER BY records.${order} ${orderDirection} LIMIT @limit OFFSET @offset`,
    )
    .all(params);
  const total = db
    .prepare(`SELECT COUNT(*) count FROM records LEFT JOIN members ON members.id = records.member_id ${where}`)
    .get(params).count;
  res.json({ rows, total, page: Number(page), pageSize: Number(pageSize) });
});
app.get("/api/records/:itemNo", requireAuth, (req, res) => {
  const record = db
    .prepare("SELECT records.*, members.name AS msr_name, members.username AS msr_username FROM records LEFT JOIN members ON members.id = records.member_id WHERE records.item_no = ?")
    .get(Number(req.params.itemNo));
  if (!record) return res.status(404).json({ error: "Record not found" });
  audit(req, "viewed record detail");
  res.json(record);
});
app.patch("/api/records/:itemNo/review", requireAdmin, (req, res) => {
  const status = String(req.body.status || "");
  if (!["Approved", "Rejected", "Correction Required"].includes(status)) return res.status(400).json({ error: "Invalid review status" });
  const record = db.prepare("SELECT * FROM records WHERE item_no = ?").get(Number(req.params.itemNo));
  if (!record) return res.status(404).json({ error: "Record not found" });
  const reviewed = new Date().toISOString().slice(0, 10);
  const processing = Math.round((new Date(reviewed) - new Date(record.date_enrolled)) / 86400000);
  db.prepare("UPDATE records SET status = ?, rejection_reason = ?, date_reviewed = ?, processing_days = ? WHERE item_no = ?").run(status, status === "Approved" ? null : String(req.body.rejectionReason || "Review required"), reviewed, processing, record.item_no);
  audit(req, `reviewed record ${record.item_no} as ${status}`);
  res.json(db.prepare("SELECT records.*, members.name AS msr_name, members.username AS msr_username FROM records LEFT JOIN members ON members.id = records.member_id WHERE records.item_no = ?").get(record.item_no));
});
app.post("/api/import", requireAuth, upload.single("workbook"), (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ error: "Upload an .xlsx, .xlsm, .xls, or .csv file." });
  try {
    const workbook = XLSX.readFile(req.file.path, { cellDates: true });
    const aliases = {
      item_no: ["item_no", "item no", "item #", "no"],
      name: ["name", "member name"],
      sss_no: ["sss_no", "sss no", "sss number", "sss#"],
      account_type: ["account_type", "account type", "type of account"],
      account_number: ["account_number", "account number", "account no"],
      status: ["status", "remarks"],
      rejection_reason: ["rejection_reason", "rejection reason", "reason"],
      date_enrolled: [
        "date_enrolled",
        "date enrolled",
        "date of enrollment",
        "enrollment date",
      ],
      date_reviewed: [
        "date_reviewed",
        "date reviewed",
        "date of review",
        "review date",
      ],
      duplicate_flag: ["duplicate_flag", "duplicate flag", "duplicate"],
    };
    const normalizeHeader = (value) =>
      String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    const keyFor = (row, keys) =>
      Object.keys(row).find((key) =>
        keys.some((alias) => {
          const actual = normalizeHeader(key);
          const expected = normalizeHeader(alias);
          return (
            actual === expected ||
            actual.includes(expected) ||
            expected.includes(actual)
          );
        }),
      );
    const selected = workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        defval: null,
      }),
    }))
      .map((sheet) => ({
        ...sheet,
        headerIndex: sheet.rows.slice(0, 40).findIndex(
          (row) =>
            row.some((cell) =>
              ["name", "membername"].includes(normalizeHeader(cell)),
            ) &&
            row.some((cell) => {
              const header = normalizeHeader(cell);
              return (
                header.includes("dateenroll") ||
                header.includes("enrollmentdate")
              );
            }),
        ),
      }))
      .find((sheet) => sheet.headerIndex >= 0);
    if (!selected)
      throw new Error(
        "Could not find a data table with Name and Date Enrolled columns.",
      );
    const headers = selected.rows[selected.headerIndex].map((cell, index) =>
      cell === null || cell === "" ? `column_${index}` : String(cell).trim(),
    );
    const sourceRows = selected.rows
      .slice(selected.headerIndex + 1)
      .filter((row) => row.some((cell) => cell !== null && cell !== ""))
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [header, row[index]]),
        ),
      );
    const dateValue = (value, field) => {
      if (value === null || value === undefined || value === "")
        throw new Error(`Missing ${field} column value`);
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime()))
        throw new Error(`Invalid ${field} date: ${value}`);
      return date.toISOString().slice(0, 10);
    };
    const normalized = [];
    const issues = [];
    const seen = new Set();
    for (const [index, row] of sourceRows.entries()) {
      const get = (field) => row[keyFor(row, aliases[field])];
      let enrolled;
      let reviewed;
      try {
        enrolled = dateValue(get("date_enrolled"), "date enrolled");
        reviewed = dateValue(get("date_reviewed"), "date reviewed");
      } catch (error) {
        issues.push(`row ${index + 2}: ${error.message}; skipped`);
        continue;
      }
      const processing = Math.round(
        (new Date(reviewed) - new Date(enrolled)) / 86400000,
      );
      const record = {
        item_no: Number(get("item_no")),
        name: String(get("name") || "").trim(),
        sss_no: String(get("sss_no") || "").trim(),
        account_type: String(get("account_type") || "")
          .trim()
          .replace(/\s+/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase()),
        account_number: String(get("account_number") || "").trim(),
        status:
          String(get("status") || "")
            .trim()
            .toLowerCase() === "approved"
            ? "Approved"
            : "Rejected",
        rejection_reason: get("rejection_reason")
          ? String(get("rejection_reason")).trim()
          : null,
        date_enrolled: enrolled,
        date_reviewed: reviewed,
        processing_days: processing,
        enrollment_month: new Intl.DateTimeFormat("en-US", {
          month: "long",
          year: "numeric",
        }).format(new Date(enrolled)),
        enrollment_year: new Date(enrolled).getUTCFullYear(),
        duplicate_flag: get("duplicate_flag")
          ? String(get("duplicate_flag"))
          : null,
      };
      const fingerprint = JSON.stringify(record);
      if (seen.has(fingerprint)) {
        issues.push(`row ${index + 2}: exact duplicate skipped`);
        continue;
      }
      seen.add(fingerprint);
      if (processing < 0)
        issues.push(
          `row ${index + 2}: negative processing days (${processing})`,
        );
      normalized.push(record);
    }
    const insert = db.prepare(
      `INSERT OR REPLACE INTO records (item_no,name,sss_no,account_type,account_number,status,rejection_reason,date_enrolled,date_reviewed,processing_days,enrollment_month,enrollment_year,duplicate_flag) VALUES (@item_no,@name,@sss_no,@account_type,@account_number,@status,@rejection_reason,@date_enrolled,@date_reviewed,@processing_days,@enrollment_month,@enrollment_year,@duplicate_flag)`,
    );
    db.transaction((rows) => rows.forEach((row) => insert.run(row)))(
      normalized,
    );
    audit(req, `imported ${normalized.length} records`);
    res.json({ imported: normalized.length, issues });
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    fs.rmSync(req.file.path, { force: true });
  }
});
app.get("/api/records.csv", requireAuth, (req, res) => {
  audit(req, "exported records");
  const filters = [];
  const params = { q: `%${req.query.q || ""}%` };
  filters.push("(name LIKE @q OR sss_no LIKE @q OR account_number LIKE @q)");
  if (req.query.month && req.query.month !== "All months") {
    filters.push("enrollment_month = @month");
    params.month = req.query.month;
  }
  if (req.query.status && req.query.status !== "All statuses") {
    filters.push("status = @status");
    params.status = req.query.status;
  }
  const rows = db
    .prepare(
      `SELECT * FROM records ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY item_no DESC`,
    )
    .all(params);
  const fields = Object.keys(rows[0] || { item_no: "" });
  const csv = [
    fields.join(","),
    ...rows.map((row) =>
      fields
        .map((field) => `"${String(row[field] ?? "").replaceAll('"', '""')}"`)
        .join(","),
    ),
  ].join("\n");
  res.attachment("daem-records.csv").send(csv);
});
app.get("/api/audit", requireAuth, (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT action, created_at FROM audit_log ORDER BY id DESC LIMIT 100",
      )
      .all(),
  ),
);
app.use(express.static(publicDir));
app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => res.sendFile(path.join(publicDir, "index.html")));
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3001);
app.listen(port, host, () =>
  console.log(`DAEM admin server listening on http://${host}:${port}`),
);
