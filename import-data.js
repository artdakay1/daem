import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import XLSX from 'xlsx'

const input = process.argv[2]
if (!input) { console.error('Usage: npm run import -- path/to/source.xlsx'); process.exit(1) }
const dbFile = process.env.DB_FILE || './data/daem.sqlite'
fs.mkdirSync(path.dirname(dbFile), { recursive: true })
const db = new Database(dbFile)
const workbook = XLSX.readFile(input, { cellDates: true })
const aliases = { item_no: ['item_no', 'item no', 'item #', 'no'], name: ['name', 'member name'], sss_no: ['sss_no', 'sss no', 'sss number', 'sss#'], account_type: ['account_type', 'account type', 'type of account'], account_number: ['account_number', 'account number', 'account no'], status: ['status', 'remarks'], rejection_reason: ['rejection_reason', 'rejection reason', 'reason'], date_enrolled: ['date_enrolled', 'date enrolled', 'date of enrollment', 'enrollment date'], date_reviewed: ['date_reviewed', 'date reviewed', 'date of review', 'review date'], duplicate_flag: ['duplicate_flag', 'duplicate flag', 'duplicate'] }
const normalizeHeader = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '')
const keyFor = (row, keys) => Object.keys(row).find(key => keys.some(alias => { const actual = normalizeHeader(key); const expected = normalizeHeader(alias); return actual === expected || actual.includes(expected) || expected.includes(actual) }))
const rawSheets = workbook.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null }) }))
const selected = rawSheets.map(sheet => ({ ...sheet, headerIndex: sheet.rows.slice(0, 40).findIndex(row => row.some(cell => ['name', 'membername'].includes(normalizeHeader(cell))) && row.some(cell => { const header = normalizeHeader(cell); return header.includes('dateenroll') || header.includes('enrollmentdate') })) })).find(sheet => sheet.headerIndex >= 0)
if (!selected) throw new Error('Could not find a data table with Name and Date Enrolled columns. Open the workbook and confirm the data sheet contains those headers.')
const headers = selected.rows[selected.headerIndex].map((cell, index) => cell === null || cell === '' ? `column_${index}` : String(cell).trim())
const sourceRows = selected.rows.slice(selected.headerIndex + 1).filter(row => row.some(cell => cell !== null && cell !== '')).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])))
function dateValue(value, field) { if (value === null || value === undefined || value === '') throw new Error(`Missing ${field} column value`); const date = value instanceof Date ? value : new Date(value); if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${field} date: ${value}`); return date.toISOString().slice(0, 10) }
const normalized = []; const corrections = []; const seen = new Set()
for (const [index, row] of sourceRows.entries()) {
  const get = field => row[keyFor(row, aliases[field])]
  let enrolled; let reviewed
  try { enrolled = dateValue(get('date_enrolled'), 'date enrolled'); reviewed = dateValue(get('date_reviewed'), 'date reviewed') } catch (error) { corrections.push(`row ${index + 2}: ${error.message}; skipped`); continue }
  const processing = Math.round((new Date(reviewed) - new Date(enrolled)) / 86400000)
  const record = { item_no: Number(get('item_no')), name: String(get('name') || '').trim(), sss_no: String(get('sss_no') || '').trim(), account_type: String(get('account_type') || '').trim().replace(/\s+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()), account_number: String(get('account_number') || '').trim(), status: String(get('status') || '').trim().toLowerCase() === 'approved' ? 'Approved' : 'Rejected', rejection_reason: get('rejection_reason') ? String(get('rejection_reason')).trim() : null, date_enrolled: enrolled, date_reviewed: reviewed, processing_days: processing, enrollment_month: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(enrolled)), enrollment_year: new Date(enrolled).getUTCFullYear(), duplicate_flag: get('duplicate_flag') ? String(get('duplicate_flag')) : null }
  const fingerprint = JSON.stringify(record); if (seen.has(fingerprint)) { corrections.push(`row ${index + 2}: exact duplicate skipped`); continue }; seen.add(fingerprint)
  if (processing < 0) corrections.push(`row ${index + 2}: negative processing_days flagged (${processing})`)
  if (String(get('status') || '') !== record.status || String(get('account_type') || '') !== record.account_type) corrections.push(`row ${index + 2}: casing normalized`)
  normalized.push(record)
}
db.exec(`CREATE TABLE IF NOT EXISTS records (item_no INTEGER PRIMARY KEY, name TEXT NOT NULL, sss_no TEXT NOT NULL, account_type TEXT NOT NULL, account_number TEXT NOT NULL, status TEXT NOT NULL, rejection_reason TEXT, date_enrolled TEXT NOT NULL, date_reviewed TEXT NOT NULL, processing_days INTEGER NOT NULL, enrollment_month TEXT NOT NULL, enrollment_year INTEGER NOT NULL, duplicate_flag TEXT)`)
const insert = db.prepare(`INSERT OR REPLACE INTO records (item_no,name,sss_no,account_type,account_number,status,rejection_reason,date_enrolled,date_reviewed,processing_days,enrollment_month,enrollment_year,duplicate_flag) VALUES (@item_no,@name,@sss_no,@account_type,@account_number,@status,@rejection_reason,@date_enrolled,@date_reviewed,@processing_days,@enrollment_month,@enrollment_year,@duplicate_flag)`)
db.transaction(rows => rows.forEach(row => insert.run(row)))(normalized)
console.log(`Imported ${normalized.length} records from ${path.basename(input)}.`)
if (corrections.length) { console.log('Corrections and data-quality report:'); corrections.forEach(line => console.log(`- ${line}`)) }