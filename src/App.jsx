import { useEffect, useState } from "react";
import "./App.css";

const records = [
  {
    item_no: 10428,
    name: "Dela Cruz, Andrea M.",
    sss_no: "34-1234567-8",
    account_type: "E-Wallet (GCash/Maya)",
    account_number: "0917 482 1190",
    status: "Approved",
    rejection_reason: "",
    date_enrolled: "2024-06-03",
    date_reviewed: "2024-06-04",
    processing_days: 1,
    enrollment_month: "June 2024",
    enrollment_year: 2024,
  },
  {
    item_no: 10427,
    name: "Santos, Marco L.",
    sss_no: "33-9081726-1",
    account_type: "PESONet Enrolled Account",
    account_number: "PH45 PESO 0048",
    status: "Approved",
    rejection_reason: "",
    date_enrolled: "2024-06-03",
    date_reviewed: "2024-06-05",
    processing_days: 2,
    enrollment_month: "June 2024",
    enrollment_year: 2024,
  },
  {
    item_no: 10426,
    name: "Reyes, Jolina C.",
    sss_no: "35-6719203-4",
    account_type: "UMID-ATM Card",
    account_number: "**** 7912",
    status: "Rejected",
    rejection_reason: "Invalid account details",
    date_enrolled: "2024-06-02",
    date_reviewed: "2024-06-04",
    processing_days: 2,
    enrollment_month: "June 2024",
    enrollment_year: 2024,
  },
  {
    item_no: 10425,
    name: "Garcia, Noel P.",
    sss_no: "34-5512839-0",
    account_type: "Bank Account (Disbursement)",
    account_number: "**** 4421",
    status: "Approved",
    rejection_reason: "",
    date_enrolled: "2024-06-01",
    date_reviewed: "2024-06-03",
    processing_days: 2,
    enrollment_month: "June 2024",
    enrollment_year: 2024,
  },
  {
    item_no: 10424,
    name: "Villanueva, Liza R.",
    sss_no: "32-8874012-6",
    account_type: "Landbank",
    account_number: "**** 1886",
    status: "Rejected",
    rejection_reason: "Name mismatch",
    date_enrolled: "2024-05-31",
    date_reviewed: "2024-06-03",
    processing_days: 3,
    enrollment_month: "May 2024",
    enrollment_year: 2024,
  },
  {
    item_no: 10423,
    name: "Mendoza, Carlo A.",
    sss_no: "33-2018944-5",
    account_type: "Prepaid Card Account",
    account_number: "**** 0368",
    status: "Approved",
    rejection_reason: "",
    date_enrolled: "2024-05-30",
    date_reviewed: "2024-06-01",
    processing_days: 2,
    enrollment_month: "May 2024",
    enrollment_year: 2024,
  },
];
function Icon({ children }) {
  return (
    <span className="icon" aria-hidden="true">
      {children}
    </span>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeView, setActiveView] = useState("Overview");
  const [month, setMonth] = useState("All months");
  const [query, setQuery] = useState("");
  const [apiRecords, setApiRecords] = useState(records);
  const [stats, setStats] = useState(null);
  const [quality, setQuality] = useState(null);
  const [status, setStatus] = useState("All statuses");
  const [msr, setMsr] = useState("All MSRs");
  const [recordsMeta, setRecordsMeta] = useState({
    total: 0,
    page: 1,
    pageSize: 25,
  });
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [members, setMembers] = useState([]);
  const [qualityRefresh, setQualityRefresh] = useState(0);
  useEffect(() => {
    fetch("/api/session")
      .then((response) => response.json())
      .then((data) => setAuthenticated(data.authenticated))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    setLoading(true);
    setError("");
    fetch(
      `/api/records?q=${encodeURIComponent(query)}&month=${encodeURIComponent(month)}&status=${encodeURIComponent(status)}&msr=${encodeURIComponent(msr)}`,
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        setApiRecords(data.rows);
        setRecordsMeta(data);
      })
      .catch(() => {
        setApiRecords([]);
        setRecordsMeta({ total: 0, page: 1, pageSize: 25 });
        setError("Unable to load records right now.");
      })
      .finally(() => setLoading(false));
  }, [authenticated, month, query, status, msr]);
  useEffect(() => {
    if (!authenticated) return;
    setStatsLoading(true);
    setStats(null);
    setError("");
    fetch(`/api/stats?month=${encodeURIComponent(month)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setStats)
      .catch(() => setError("Unable to load dashboard statistics right now."))
      .finally(() => setStatsLoading(false));
  }, [authenticated, month]);
  useEffect(() => {
    if (!authenticated || activeView !== "Data quality") return;
    setError("");
    fetch("/api/data-quality")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setQuality)
      .catch(() => setError("Unable to load data quality checks right now."));
  }, [authenticated, activeView, qualityRefresh]);
  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/members")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setMembers)
      .catch(() => setError("Unable to load member approvals right now."));
  }, [authenticated]);
  async function login(username, password) {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) throw new Error((await response.json()).error);
    setAuthenticated(true);
    setLoginError("");
  }
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setAuthenticated(false);
  }
  async function reviewRecord(record, reviewStatus) {
    setReviewing(true);
    try {
      const response = await fetch(`/api/records/${record.item_no}/review`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: reviewStatus, rejectionReason: reviewStatus === "Approved" ? "" : "Reviewed by administrator" }) });
      if (!response.ok) throw new Error((await response.json()).error || "Unable to review record");
      const updated = await response.json();
      setSelectedRecord(null);
      setApiRecords((current) => current.map((item) => item.item_no === updated.item_no ? updated : item));
    } catch (reviewError) {
      setError(reviewError.message);
    } finally {
      setReviewing(false);
    }
  }
  if (!authenticated)
    return (
      <Login onLogin={login} error={loginError} setError={setLoginError} />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/sss-logo.svg" alt="SSS" />
          <div>
            <strong>DAEM</strong>
            <small>Monitoring dashboard</small>
          </div>
        </div>
        <div className="side-label">Workspace</div>
        <nav>
          {["Overview", "Records", "Data quality", "Member approvals"].map((item) => (
            <button
              className={activeView === item ? "nav-item active" : "nav-item"}
              onClick={() => setActiveView(item)}
              key={item}
            >
              <Icon>
                {item === "Overview" ? "◈" : item === "Records" ? "▤" : item === "Data quality" ? "⌁" : "✓"}
              </Icon>
              {item}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="secure">
            <span>●</span>
            <div>
              <b>Private workspace</b>
              <small>Last synced just now</small>
            </div>
          </div>
          <button className="user-row" onClick={logout} aria-label="Log out of administrator account">
            <span className="avatar">J</span>
            <span>
              <b>Jarvis</b>
              <small>Administrator</small>
            </span>
            <span className="logout">↗</span>
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">Thursday, 06 June 2024</div>
            <h1>
              {activeView === "Overview" ? "Good morning, Jarvis." : activeView}
            </h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" title="Notifications">
              ◌<i></i>
            </button>
            <ImportButton />
            <a
              className="export-button"
              href={`/api/records.csv?month=${encodeURIComponent(month)}&status=${encodeURIComponent(status)}`}
            >
              <Icon>↓</Icon> Export CSV
            </a>
          </div>
        </header>
        {error && (
          <div className="api-error" role="alert">
            {error}
          </div>
        )}
        {activeView === "Overview" ? (
          <Overview
            month={month}
            setMonth={setMonth}
            stats={stats}
            loading={statsLoading}
          />
        ) : activeView === "Records" ? (
          <RecordsView
            records={loading ? [] : apiRecords}
            total={recordsMeta.total}
            query={query}
            setQuery={setQuery}
            month={month}
            setMonth={setMonth}
            status={status}
            setStatus={setStatus}
            msr={msr}
            setMsr={setMsr}
            members={members}
            loading={loading}
            onSelectRecord={setSelectedRecord}
          />
        ) : activeView === "Data quality" ? (
          <DataQualityView quality={quality} onSelectRecord={setSelectedRecord} onRefresh={() => { setQuality(null); setQualityRefresh((current) => current + 1); }} />
        ) : (
          <MemberApprovals members={members} onUpdate={(member) => setMembers((current) => current.map((item) => item.id === member.id ? member : item))} />
        )}
        {selectedRecord && <RecordReview record={selectedRecord} reviewing={reviewing} onClose={() => setSelectedRecord(null)} onReview={reviewRecord} />}
      </main>
    </div>
  );
}

function Login({ onLogin, error, setError }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const submit = async () => {
    try {
      await onLogin(username, password);
    } catch (loginFailure) {
      setError(loginFailure.message);
    }
  };
  return (
    <main className="login-page">
      <div className="login-art">
        <div className="art-grid"></div>
        <div className="art-copy">
          <img className="brand-logo large" src="/sss-logo.svg" alt="SSS" />
          <span>DAEM / 01</span>
          <h1>
            Clarity for every
            <br />
            <em>disbursement.</em>
          </h1>
          <p>
            Monitor enrollment performance, protect member data, and keep every
            decision moving.
          </p>
        </div>
        <div className="art-meta">
          Secure operations console <span>•</span> v1.0
        </div>
      </div>
      <section className="login-panel">
        <div className="login-inner">
          <div className="mobile-brand">
            <img className="brand-logo" src="/sss-logo.svg" alt="SSS" />
            <strong>DAEM</strong>
          </div>
          <div className="eyebrow">Restricted access</div>
          <h2>Welcome back.</h2>
          <p className="login-subtitle">
            Sign in to your monitoring workspace.
          </p>
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your username"
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Enter your password"
            />
          </label>
          <div className="login-options">
            <label className="check">
              <input type="checkbox" defaultChecked /> Keep me signed in
            </label>
            <a href="#help">Need help?</a>
          </div>
          <button className="login-button" onClick={submit}>
            Enter dashboard <span>→</span>
          </button>
          {error && <p className="login-error">{error}</p>}
          <p className="login-note">
            <span>◉</span> Your session is encrypted and private.
          </p>
        </div>
      </section>
    </main>
  );
}
function ImportButton() {
  const [message, setMessage] = useState("");
  const upload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("workbook", file);
    setMessage("Importing...");
    const response = await fetch("/api/import", { method: "POST", body: form });
    const result = await response.json();
    setMessage(
      response.ok
        ? `Imported ${result.imported} records${result.issues.length ? `; ${result.issues.length} issues reported` : ""}`
        : result.error,
    );
    event.target.value = "";
    setTimeout(() => setMessage(""), 6000);
  };
  return (
    <label className="import-button">
      <Icon>↑</Icon> Import data
      <input type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={upload} />
      {message && <span className="import-message">{message}</span>}
    </label>
  );
}
function Overview({ month, setMonth, stats, loading }) {
  const totals = stats?.totals || {};
  const total = Number(totals.total || 0);
  const approved = Number(totals.approved || 0);
  const rejected = Number(totals.rejected || 0);
  const average = Number(totals.average_processing || 0);
  const approvalRate = total ? Math.round((approved / total) * 100) : 0;
  return (
    <div className="dashboard">
      <div className="section-head">
        <div>
          <span className="section-kicker">Enrollment pulse</span>
          <h2>At a glance</h2>
        </div>
        <select
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        >
          <option>All months</option>
          <option>June 2024</option>
          <option>May 2024</option>
        </select>
      </div>
      {loading && !stats ? <div className="panel loading-state">Loading dashboard statistics...</div> : <div className="metrics">
        <Metric label="Total records" value={total.toLocaleString()} trend={`${approvalRate}%`} tone="blue" />
        <Metric label="Approved" value={approved.toLocaleString()} trend={`${approvalRate}%`} tone="green" />
        <Metric label="Rejected" value={rejected.toLocaleString()} trend={`${total ? Math.round((rejected / total) * 100) : 0}%`} tone="red" />
        <Metric
          label="Avg. processing"
          value={`${average} days`}
          trend="Live"
          tone="yellow"
        />
      </div>}
      <div className="chart-grid">
        <section className="panel trend-panel">
          <PanelTitle title="Enrollment trend" meta={stats?.monthly?.length ? `${stats.monthly[0].label} — ${stats.monthly[stats.monthly.length - 1].label}` : "No data"} />
          <div className="chart-legend">
            <span>
              <i className="dot navy"></i>All enrollments
            </span>
            <span>
              <i className="dot coral"></i>Approved
            </span>
          </div>
          <LineChart monthly={stats?.monthly || []} />
        </section>
        <section className="panel split-panel">
          <PanelTitle title="Approval performance" meta={`${approvalRate}% approved`} />
          <div className="donut-wrap">
            <div className="donut">
              <strong>
                {approvalRate}<span>%</span>
              </strong>
              <small>approval rate</small>
            </div>
            <div className="mini-legend">
              <div>
                <i className="dot green"></i>
                <span>
                  Approved<b>{approved.toLocaleString()}</b>
                </span>
              </div>
              <div>
                <i className="dot coral"></i>
                <span>
                  Rejected<b>{rejected.toLocaleString()}</b>
                </span>
              </div>
            </div>
          </div>
        </section>
        <section className="panel reasons-panel">
          <PanelTitle title="Rejection reasons" meta={`${rejected.toLocaleString()} total`} />
          <div className="reason-list">
            {(stats?.reasons || []).slice(0, 4).map((reason, index) => <Reason key={reason.label} name={reason.label} value={reason.value} width={`${Math.max(30, 100 - index * 20)}%`} color={index === 0 ? "coral" : index === 1 ? "navy" : index === 2 ? "gold" : "sage"} />)}
          </div>
          {!stats?.reasons?.length && <div className="empty">No rejection reasons found.</div>}<button className="text-button">
            View all reasons <span>→</span>
          </button>
        </section>
        <section className="panel bars-panel">
          <PanelTitle title="Average processing days" meta="Target: 3 days" />
          <BarChart monthly={stats?.monthly || []} />
        </section>
      </div>
      <section className="panel activity-panel">
        <PanelTitle title="Recent enrollments" meta="Showing latest 6 records">
          <button className="text-button">
            View records <span>→</span>
          </button>
        </PanelTitle>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>MSR / Member</th>
                <th>Account type</th>
                <th>Enrolled</th>
                <th>Processing</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.item_no}>
                  <td>
                    <strong>{record.name}</strong>
                    <small>{record.sss_no}</small>
                  </td>
                  <td>{record.msr_name || "Admin import"}<small>{record.msr_username ? "Member submission" : "Administrator"}</small></td>
                  <td>{record.account_type}</td>
                  <td>{record.date_enrolled}</td>
                  <td>
                    {record.processing_days} day
                    {record.processing_days !== 1 ? "s" : ""}
                  </td>
                  <td>
                    <span className={`status ${record.status.toLowerCase()}`}>
                      {record.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
function Metric({ label, value, trend, tone }) {
  return (
    <article className="metric">
      <div className={`metric-icon ${tone}`}>
        {tone === "blue"
          ? "⌁"
          : tone === "green"
            ? "✓"
            : tone === "red"
              ? "!"
              : "◷"}
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={tone}>
        {trend} <em>vs last month</em>
      </small>
    </article>
  );
}
function PanelTitle({ title, meta, children }) {
  return (
    <div className="panel-title">
      <div>
        <h3>{title}</h3>
        <span>{meta}</span>
      </div>
      {children}
    </div>
  );
}
function LineChart({ monthly: points }) {
  const data = points.length ? points : [{ label: "No data", total: 0, approved: 0 }];
  const max = Math.max(...data.map((item) => Number(item.total || 0)), 1);
  const coordinates = data.map((item, index) => [data.length === 1 ? 300 : (index * 600) / (data.length - 1), 165 - (Number(item.total || 0) / max) * 135]);
  const approvedCoordinates = data.map((item, index) => [data.length === 1 ? 300 : (index * 600) / (data.length - 1), 165 - (Number(item.approved || 0) / max) * 135]);
  const path = coordinates.map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`).join(" ");
  const approvedPath = approvedCoordinates.map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`).join(" ");
  const chartWidth = Math.max(600, data.length * 56);
  return (
    <div className="line-chart">
      <div className="y-axis">
        <span>{max.toLocaleString()}</span>
        <span>{Math.round(max * 0.75).toLocaleString()}</span>
        <span>{Math.round(max * 0.5).toLocaleString()}</span>
        <span>{Math.round(max * 0.25).toLocaleString()}</span>
        <span>0</span>
      </div>
      <svg
        viewBox="0 0 600 190"
        preserveAspectRatio="none"
        style={{ width: `${chartWidth}px` }}
        aria-label="Enrollment trend chart"
      >
        <path
          className="fill"
          d={`${path} L600,190 L0,190Z`}
        />
        <path
          className="line secondary"
          d={approvedPath}
        />
        <path
          className="line"
          d={path}
        />
        {coordinates.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="4" />
        ))}
      </svg>
      <div className="x-axis" style={{ width: `${chartWidth}px` }}>
        {data.map((item) => <span key={item.label}>{item.label}</span>)}
      </div>
    </div>
  );
}
function BarChart({ monthly: data }) {
  return (
    <div className="bar-chart">
      {data.map((item) => (
        <div className="bar-group" key={item.label}>
          <div className="bar-value">{item.days}</div>
          <div className="bar" style={{ height: `${item.days * 35}px` }}></div>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
function Reason({ name, value, width, color }) {
  return (
    <div className="reason">
      <div>
        <span>{name}</span>
        <b>{value}</b>
      </div>
      <div className="reason-track">
        <i className={color} style={{ width }}></i>
      </div>
    </div>
  );
}
function DataQualityView({ quality, onSelectRecord, onRefresh }) {
  const checks = [
    ["Negative processing days", quality?.negativeProcessing || 0, "Records where review happened before enrollment"],
    ["Missing dates", quality?.missingDates || 0, "Records without enrollment or review dates"],
    ["Duplicate records", quality?.duplicates || 0, "Records marked as duplicates during import"],
    ["Rejected without reason", quality?.rejectedWithoutReason || 0, "Rejected records requiring an explanation"],
  ];
  const issueRows = Object.entries(quality?.issues || {}).flatMap(([type, rows]) => rows.map((row) => ({ ...row, type })));
  return <div className="dashboard"><div className="section-head"><div><span className="section-kicker">Integrity checks</span><h2>Data quality</h2></div><button className="export-button" onClick={onRefresh}>Refresh checks</button></div><div className="metrics">{checks.map(([label, value, description]) => <article className="metric" key={label}><div className={`metric-icon ${value ? "red" : "green"}`}>{value ? "!" : "✓"}</div><span>{label}</span><strong>{quality ? Number(value).toLocaleString() : "—"}</strong><small className={value ? "red" : "green"}>{quality ? (value ? "Needs review" : "Clear") : "Loading"}</small><p>{description}</p></article>)}</div><section className="panel"><PanelTitle title="Review queue" meta={`${issueRows.length} issue${issueRows.length === 1 ? "" : "s"} found`} />{issueRows.length ? <div className="table-wrap"><table><thead><tr><th>Record</th><th>Issue</th><th>Client</th><th>MSR / Member</th><th>Status</th><th>Action</th></tr></thead><tbody>{issueRows.map((row) => <tr key={`${row.type}-${row.item_no}`}><td>#{row.item_no}</td><td>{row.type === "negativeProcessing" ? "Negative processing days" : row.type === "missingDates" ? "Missing dates" : row.type === "duplicates" ? "Duplicate record" : "Rejected without reason"}</td><td>{row.name}</td><td>{row.msr_name || "Admin import"}</td><td><span className={`status ${row.status.toLowerCase().replaceAll(" ", "-")}`}>{row.status}</span></td><td><button onClick={() => onSelectRecord(row)}>Open record</button></td></tr>)}</tbody></table></div> : <div className="empty">All data quality checks are clear.</div>}</section></div>;
}
function RecordsView({
  records: visibleRecords,
  total,
  query,
  setQuery,
  month,
  setMonth,
  status,
  setStatus,
  msr,
  setMsr,
  members,
  loading,
  onSelectRecord,
}) {
  return (
    <div className="dashboard records-view">
      <div className="section-head">
        <div>
          <span className="section-kicker">Secure database</span>
          <h2>
            All records <sup>4,725</sup>
          </h2>
        </div>
        <a className="export-button" href={`/api/records.csv?q=${encodeURIComponent(query)}&month=${encodeURIComponent(month)}&status=${encodeURIComponent(status)}&msr=${encodeURIComponent(msr)}`}>↓ Export filtered</a>
      </div>
      <section className="panel records-panel">
        <div className="filters">
          <div className="search">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, SSS number, or account"
            />
          </div>
          <select
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          >
            <option>All months</option>
            <option>June 2024</option>
            <option>May 2024</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option>All statuses</option>
            <option>Submitted</option>
            <option>Correction Required</option>
            <option>Approved</option>
            <option>Rejected</option>
          </select>
          <select value={msr} onChange={(event) => setMsr(event.target.value)}>
            <option>All MSRs</option>
            {members.filter((member) => member.approval_status === "Approved").map((member) => <option key={member.username} value={member.username}>{member.name}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item No</th>
                <th>Name</th>
                <th>MSR / Member</th>
                <th>SSS No</th>
                <th>Account Type</th>
                <th>Account #</th>
                <th>Status</th>
                <th>Rejection Reason</th>
                <th>Date Enrolled</th>
                <th>Date Reviewed</th>
                <th>Processing Days</th>
                <th>Enrollment Month</th>
                <th>Enrollment Year</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="13">Loading records...</td></tr>}
              {!loading && visibleRecords.map((record) => (
                <tr key={record.item_no} onClick={() => onSelectRecord(record)} className="record-row" tabIndex="0" onKeyDown={(event) => { if (event.key === "Enter") onSelectRecord(record); }}>
                  <td>#{record.item_no}</td>
                  <td>{record.name}</td>
                  <td>{record.msr_name || "Admin import"}</td>
                  <td>{record.sss_no}</td>
                  <td>{record.account_type}</td>
                  <td>{record.account_number}</td>
                  <td>
                    <span className={`status ${record.status.toLowerCase().replaceAll(" ", "-")}`}>
                      {record.status}
                    </span>
                  </td>
                  <td>{record.rejection_reason || ""}</td>
                  <td>{record.date_enrolled}</td>
                  <td>{record.date_reviewed}</td>
                  <td>{record.processing_days}</td>
                  <td>{record.enrollment_month?.replace(" ", "-")}</td>
                  <td>{record.enrollment_year}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && visibleRecords.length === 0 && (
            <div className="empty">No matching records found.</div>
          )}
        </div>
        <div className="pagination">
          <span>Showing {visibleRecords.length} of {total.toLocaleString()} records</span>
          <div>
            <button disabled>←</button>
            <button className="page-number">1</button>
            <button>2</button>
            <button>3</button>
            <button>→</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MemberApprovals({ members, onUpdate }) {
  const updateApproval = async (member, approvalStatus) => {
    const response = await fetch(`/api/members/${member.id}/approval`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalStatus }),
    });
    if (!response.ok) return;
    onUpdate(await response.json());
  };
  return (
    <section className="panel">
      <div className="section-head"><div><span className="section-kicker">Access control</span><h2>Member approvals</h2></div><span className="section-kicker">Administrator only</span></div>
      <div className="table-wrap"><table><thead><tr><th>Member</th><th>Username</th><th>SSS No.</th><th>Status</th><th>Action</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.name}</strong></td><td>{member.username}</td><td>{member.sss_no}</td><td><span className={`status ${member.approval_status.toLowerCase()}`}>{member.approval_status}</span></td><td>{member.approval_status === "Pending" ? <><button className="review-approve" onClick={() => updateApproval(member, "Approved")}>Approve</button> <button className="review-reject" onClick={() => updateApproval(member, "Rejected")}>Reject</button></> : <button onClick={() => updateApproval(member, member.approval_status === "Approved" ? "Rejected" : "Approved")}>{member.approval_status === "Approved" ? "Revoke access" : "Approve"}</button>}</td></tr>)}</tbody></table>{members.length === 0 && <div className="empty">No member accounts have been created.</div>}</div>
    </section>
  );
}

function RecordReview({ record, reviewing, onClose, onReview }) {
  return <div className="review-overlay" role="dialog" aria-modal="true" aria-label="Review member record">
    <section className="review-panel">
      <div className="panel-title"><div><span className="section-kicker">Member submission</span><h2>Review #{record.item_no}</h2></div><button className="close-button" onClick={onClose} aria-label="Close review">×</button></div>
      <div className="review-details"><div><span>Name</span><strong>{record.name}</strong></div><div><span>SSS No</span><strong>{record.sss_no}</strong></div><div><span>Account type</span><strong>{record.account_type}</strong></div><div><span>Account number</span><strong>{record.account_number}</strong></div><div><span>Date enrolled</span><strong>{record.date_enrolled}</strong></div><div><span>Current status</span><strong className={`status ${record.status.toLowerCase().replaceAll(" ", "-")}`}>{record.status}</strong></div></div>
      <p className="review-note">{record.rejection_reason || "Review the member information before making a final decision."}</p>
      <div className="review-actions"><button className="review-approve" disabled={reviewing} onClick={() => onReview(record, "Approved")}>Approve</button><button className="review-reject" disabled={reviewing} onClick={() => onReview(record, "Rejected")}>Reject</button><button className="review-correction" disabled={reviewing} onClick={() => onReview(record, "Correction Required")}>Request correction</button></div>
    </section>
  </div>;
}

export default App;
