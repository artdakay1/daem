# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:


## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

# DAEM Monitoring Dashboard

A private-operations dashboard for Disbursement Account Enrollment Module (DAEM) records.

## Run locally

```bash
npm install
npm run dev
```

For Windows PowerShell, use the command shim if PowerShell blocks `npm.ps1`:

```powershell
npm.cmd install
npm.cmd run dev
```

Copy `.env.example` to `.env` and set a long `SESSION_SECRET` and a strong `ADMIN_PASSWORD` before using real data. The app opens on a restricted login screen. The default local account is `admin` / `change-this-before-use` unless you change it in `.env`.

On Windows PowerShell, create the file with `Copy-Item .env.example .env`, then open `.env` in VS Code and edit the values. Do not paste `PORT=3001` directly into PowerShell; those `KEY=value` lines are file contents.

`npm run dev` starts the admin Express API on port `3001` and the Vite client. Run `npm run member:server` in a second terminal to start the member portal on port `3002`. Both servers use the same SQLite database, while member sessions and admin sessions remain separate. Every data route requires an expiring, HTTP-only session cookie. Failed admin logins are throttled after five attempts, and dashboard/records/export/review actions are written to the audit log.

The member portal is available at `http://localhost:3002`. Members can register, submit disbursement account data, and track their own submissions. Administrators review submissions from the admin API with `PATCH /api/records/:itemNo/review` and a JSON body such as `{ "status": "Approved" }` or `{ "status": "Correction Required", "rejectionReason": "Name mismatch" }`.

## Current scope

- Dashboard summary cards and enrollment trend visualizations
- Approval performance and rejection-reason breakdowns
- Searchable records view with month/status filters
- Responsive layout for desktop and mobile
- SQLite-backed records and session authentication
- Server-side filtered records, pagination, CSV export, and audit events
- Spreadsheet importer with casing/date normalization, exact-repeat deduplication, and data-quality reporting

The records in `src/App.jsx` are representative fallback data for the visual shell. Import a source workbook with:

```bash
npm run import -- path/to/source.xlsx
```

On Windows, replace the example path with the real workbook path and use:

```powershell
npm.cmd run import -- "C:\Users\YourName\Downloads\source.xlsx"
```

The importer also accepts `.xlsm` files, derives processing days/month/year from dates, normalizes status and account type casing, preserves duplicate flags, skips exact repeats, and prints corrections including negative processing-day issues.

## Scripts

- `npm run dev` starts the Vite development server.
- `npm run build` creates a production build.
- `npm run lint` runs Oxlint.
