import React, { useMemo, useState } from "react";
import {
  LayoutDashboard,
  ListChecks,
  Clock,
  Flame,
  Building2,
  Users,
  BarChart3,
  Bell,
  Settings,
  ClipboardList,
  Activity,
  CheckCircle2,
  Search,
  Plus,
} from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import StatCard from "./StatCard.jsx";
import ComplaintTable from "./ComplaintTable.jsx";
import ComplaintDetails from "./ComplaintDetails.jsx";
import NotificationList, { PageTitle } from "./NotificationList.jsx";
import { DonutChart, BarList, TrendChart, ChartCard } from "./Charts.jsx";
import { TextInput, inputCls } from "./Field.jsx";
import { CATEGORIES, PRIORITIES, STATUSES, TODAY, formatDate, isOpen, isPending } from "../data/constants.js";

function ComplaintManager({ title, subtitle, base, departments, citizenName, onOpen }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [category, setCategory] = useState("All");
  const [priority, setPriority] = useState("All");
  const [department, setDepartment] = useState("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return base.filter(
      (c) =>
        (status === "All" || c.status === status) &&
        (category === "All" || c.category === category) &&
        (priority === "All" || c.priority === priority) &&
        (department === "All" || c.department === department) &&
        (!q || [c.id, c.title, c.location, citizenName[c.citizenId]].join(" ").toLowerCase().includes(q))
    );
  }, [base, query, status, category, priority, department, citizenName]);

  const hasFilter = query || status !== "All" || category !== "All" || priority !== "All" || department !== "All";
  const reset = () => {
    setQuery(""); setStatus("All"); setCategory("All"); setPriority("All"); setDepartment("All");
  };

  const select = (label, value, setter, options) => (
    <select aria-label={`Filter by ${label}`} value={value} onChange={(e) => setter(e.target.value)} className={inputCls(false)}>
      <option value="All">All {label}s</option>
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );

  return (
    <>
      <PageTitle title={title} subtitle={subtitle} />
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input aria-label="Search complaints" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by ID, title, location or citizen name" className={`${inputCls(false)} pl-10`} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {select("status", status, setStatus, STATUSES)}
          {select("category", category, setCategory, CATEGORIES)}
          {select("priority", priority, setPriority, PRIORITIES)}
          {select("department", department, setDepartment, departments.map((d) => d.name))}
        </div>
        <div className="flex items-center justify-between text-sm text-muted">
          <p aria-live="polite">{filtered.length} of {base.length} complaints</p>
          {hasFilter && <button onClick={reset} className="font-semibold text-brand hover:text-brand-dark">Clear filters</button>}
        </div>
      </div>
      <ComplaintTable complaints={filtered} variant="admin" citizenName={citizenName} onView={(c) => onOpen(c.id)} />
    </>
  );
}

function avgResolutionDays(complaints) {
  const done = complaints.filter((c) => c.status === "Resolved");
  if (!done.length) return 0;
  const total = done.reduce((s, c) => {
    const last = c.timeline[c.timeline.length - 1].date;
    return s + (new Date(last) - new Date(c.date)) / 86400000;
  }, 0);
  return Math.round(total / done.length);
}

export default function AdminDashboard({ user, complaints, citizens, notifications, departments, onUpdateComplaint, onAddDepartment, onMarkAllRead, onLogout, notify }) {
  const [section, setSection] = useState("overview");
  const [selected, setSelected] = useState(null);
  const [deptName, setDeptName] = useState("");
  const [deptHead, setDeptHead] = useState("");
  const [deptError, setDeptError] = useState("");

  const citizenName = useMemo(() => Object.fromEntries(citizens.map((c) => [c.id, c.name])), [citizens]);
  const adminNotes = notifications.filter((n) => n.to === "admin");
  const unread = adminNotes.filter((n) => !n.read).length;

  const pending = useMemo(() => complaints.filter(isPending), [complaints]);
  const high = useMemo(() => complaints.filter((c) => c.priority === "High" && isOpen(c)), [complaints]);

  const statusData = useMemo(() => STATUSES.map((s) => ({ label: s, value: complaints.filter((c) => c.status === s).length })), [complaints]);
  const categoryData = useMemo(() => CATEGORIES.map((c) => ({ label: c, value: complaints.filter((x) => x.category === c).length })), [complaints]);
  const deptData = useMemo(
    () => departments.map((d) => {
      const list = complaints.filter((c) => c.department === d.name);
      const resolved = list.filter((c) => c.status === "Resolved").length;
      return { name: d.name, head: d.head, total: list.length, open: list.filter(isOpen).length, resolved, rate: list.length ? Math.round((resolved / list.length) * 100) : 0 };
    }),
    [complaints, departments]
  );
  const trendData = useMemo(() => {
    const months = [];
    const base = new Date(`${TODAY.slice(0, 7)}-01T00:00:00Z`);
    for (let i = 4; i >= 0; i--) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
      months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), value: 0 });
    }
    complaints.forEach((c) => {
      const m = months.find((x) => x.key === c.date.slice(0, 7));
      if (m) m.value += 1;
    });
    return months;
  }, [complaints]);

  const resolutionRate = complaints.length ? Math.round((statusData[3].value / complaints.length) * 100) : 0;
  const openComplaint = selected ? complaints.find((c) => c.id === selected) : null;

  const items = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "all", label: "All Complaints", icon: ListChecks },
    { key: "pending", label: "Pending Complaints", icon: Clock, badge: pending.length },
    { key: "high", label: "High-Priority", icon: Flame, badge: high.length },
    { key: "departments", label: "Department Management", icon: Building2 },
    { key: "citizens", label: "Citizen Records", icon: Users },
    { key: "reports", label: "Reports & Analytics", icon: BarChart3 },
    { key: "notifications", label: "Notifications", icon: Bell, badge: unread },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  async function handleUpdate(id, changes) {
    try {
      const result = await onUpdateComplaint(id, changes);
      notify(result.changed ? `Complaint ${id} updated.` : "No changes to save.", result.changed ? "success" : "info");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function addDept(e) {
    e.preventDefault();
    const name = deptName.trim();
    if (name.length < 3) return setDeptError("Enter a department name (at least 3 characters).");
    if (departments.some((d) => d.name.toLowerCase() === name.toLowerCase())) return setDeptError("This department already exists.");
    try {
      await onAddDepartment({ name, head: deptHead.trim() });
    } catch (err) {
      return setDeptError(err.message);
    }
    setDeptName(""); setDeptHead(""); setDeptError("");
    notify(`Department "${name}" added.`, "success");
  }

  const common = { departments, citizenName, onOpen: setSelected };

  return (
    <Sidebar variant="admin" items={items} active={section} onChange={setSection} user={user} onLogout={onLogout}>
      {section === "overview" && (
        <>
          <PageTitle title="Administration Overview" subtitle={`Signed in as ${user.name}. Figures are calculated from live complaint records.`} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard title="Total Complaints" value={complaints.length} icon={ClipboardList} tone="navy" />
            <StatCard title="Pending Complaints" value={pending.length} icon={Clock} tone="sky" hint="Submitted or under review" />
            <StatCard title="In Progress" value={statusData[2].value} icon={Activity} tone="amber" />
            <StatCard title="Resolved" value={statusData[3].value} icon={CheckCircle2} tone="emerald" />
            <StatCard title="High-Priority Issues" value={high.length} icon={Flame} tone="rose" hint="Open complaints" />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <ChartCard title="Status distribution"><DonutChart data={statusData} /></ChartCard>
            <ChartCard title="Complaints per month"><TrendChart data={trendData} /></ChartCard>
          </div>
          <h2 className="mb-3 mt-8 text-lg font-semibold text-navy">All complaints ({complaints.length})</h2>
          <ComplaintTable complaints={complaints.slice().sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))} variant="admin" citizenName={citizenName} onView={(c) => setSelected(c.id)} emptyText="No complaints have been submitted yet." />
        </>
      )}

      {section === "all" && <ComplaintManager title="All Complaints" subtitle="Search, filter and manage every complaint." base={complaints} {...common} />}
      {section === "pending" && <ComplaintManager title="Pending Complaints" subtitle="Complaints that are submitted or under review." base={pending} {...common} />}
      {section === "high" && <ComplaintManager title="High-Priority Complaints" subtitle="Open complaints marked as high priority." base={high} {...common} />}

      {section === "departments" && (
        <>
          <PageTitle title="Department Management" subtitle="Workload and resolution rate by department." />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {deptData.map((d) => (
              <article key={d.name} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-navy">{d.name}</h2>
                <p className="text-xs text-muted">Head: {d.head || "Not assigned"}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-lg font-bold text-ink">{d.total}</p><p className="text-[11px] text-muted">Total</p></div>
                  <div className="rounded-xl bg-amber-50 p-2.5"><p className="text-lg font-bold text-amber-800">{d.open}</p><p className="text-[11px] text-muted">Open</p></div>
                  <div className="rounded-xl bg-emerald-50 p-2.5"><p className="text-lg font-bold text-emerald-800">{d.resolved}</p><p className="text-[11px] text-muted">Resolved</p></div>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600"><span>Resolution rate</span><span>{d.rate}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${d.rate}%` }} /></div>
                </div>
              </article>
            ))}
          </div>
          <form onSubmit={addDept} noValidate className="mt-6 max-w-2xl rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-navy">Add a department</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextInput id="dept-name" label="Department name" value={deptName} onChange={(e) => { setDeptName(e.target.value); setDeptError(""); }} error={deptError} required />
              <TextInput id="dept-head" label="Department head" value={deptHead} onChange={(e) => setDeptHead(e.target.value)} placeholder="Optional" />
            </div>
            <div className="mt-4 flex justify-end">
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-light">
                <Plus size={16} aria-hidden="true" /> Add department
              </button>
            </div>
          </form>
        </>
      )}

      {section === "citizens" && (
        <>
          <PageTitle title="Citizen Records" subtitle="Registered citizens and their complaint counts." />
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <caption className="sr-only">Citizen records</caption>
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>{["ID", "Name", "Ward", "Joined", "Complaints", "Open"].map((h) => <th key={h} scope="col" className="px-4 py-3">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {citizens.map((c) => {
                    const list = complaints.filter((x) => x.citizenId === c.id);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-navy">{c.id}</td>
                        <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                        <td className="px-4 py-3 text-slate-700">{c.ward || "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{formatDate(c.joined)}</td>
                        <td className="px-4 py-3 text-slate-700">{list.length}</td>
                        <td className="px-4 py-3 text-slate-700">{list.filter(isOpen).length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {section === "reports" && (
        <>
          <PageTitle title="Reports & Analytics" subtitle="Summary visualisations based on live complaint records." />
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title="Resolution rate" value={`${resolutionRate}%`} icon={CheckCircle2} tone="emerald" />
            <StatCard title="Avg. days to resolve" value={avgResolutionDays(complaints)} icon={Clock} tone="amber" />
            <StatCard title="Open complaints" value={complaints.filter(isOpen).length} icon={ClipboardList} tone="navy" />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <ChartCard title="Status distribution"><DonutChart data={statusData} /></ChartCard>
            <ChartCard title="Complaints per month"><TrendChart data={trendData} /></ChartCard>
            <ChartCard title="Complaints by category"><BarList data={categoryData} /></ChartCard>
            <ChartCard title="Resolution rate by department"><BarList color="#102a43" data={deptData.map((d) => ({ label: d.name, value: d.rate, display: `${d.rate}%` }))} /></ChartCard>
          </div>
        </>
      )}

      {section === "notifications" && (
        <>
          <PageTitle title="Notifications" subtitle="Alerts about new and high-priority complaints." />
          <NotificationList items={adminNotes} onMarkAllRead={() => onMarkAllRead("admin")} />
        </>
      )}

      {section === "settings" && (
        <>
          <PageTitle title="Account" subtitle="Your administrator account details." />
          <dl className="max-w-2xl divide-y divide-line rounded-2xl border border-line bg-white shadow-sm">
            {[
              ["Name", user.name],
              ["Employee ID", user.id],
              ["Email", user.email],
              ["Designation", user.designation || "-"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 p-5 text-sm">
                <dt className="font-semibold text-ink">{k}</dt>
                <dd className="text-slate-700">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 max-w-2xl text-xs text-muted">Administrator accounts and passwords are managed by the system administrator.</p>
        </>
      )}

      {openComplaint && (
        <ComplaintDetails
          complaint={openComplaint}
          citizenName={citizenName[openComplaint.citizenId] ?? "Unknown"}
          isAdmin
          departments={departments}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      )}
    </Sidebar>
  );
}
