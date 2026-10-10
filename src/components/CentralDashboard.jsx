import React, { useMemo, useState } from "react";
import { LayoutDashboard, ListChecks, Building2, Users, ClipboardList, Clock, Activity, CheckCircle2, Flame } from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import StatCard from "./StatCard.jsx";
import ComplaintTable from "./ComplaintTable.jsx";
import ComplaintDetails from "./ComplaintDetails.jsx";
import { PageTitle } from "./NotificationList.jsx";
import { DonutChart, BarList, TrendChart, ChartCard } from "./Charts.jsx";
import { ComplaintManager } from "./AdminDashboard.jsx";
import { CATEGORIES, STATUSES, TODAY, formatDate, isOpen, isPending } from "../data/constants.js";

// Read-only national view: no complaint, department or account can be changed from here.
export default function CentralDashboard({ user, complaints, citizens, departments, onLogout }) {
  const [section, setSection] = useState("overview");
  const [selected, setSelected] = useState(null);

  const citizenName = useMemo(() => Object.fromEntries(citizens.map((c) => [c.id, c.name])), [citizens]);
  const pending = useMemo(() => complaints.filter(isPending), [complaints]);
  const high = useMemo(() => complaints.filter((c) => c.priority === "High" && isOpen(c)), [complaints]);
  const statusData = useMemo(() => STATUSES.map((s) => ({ label: s, value: complaints.filter((c) => c.status === s).length })), [complaints]);
  const categoryData = useMemo(() => CATEGORIES.map((c) => ({ label: c, value: complaints.filter((x) => x.category === c).length })), [complaints]);
  const deptData = useMemo(
    () =>
      departments.map((d) => {
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

  const openComplaint = selected ? complaints.find((c) => c.id === selected) : null;
  const items = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "all", label: "All Complaints", icon: ListChecks },
    { key: "departments", label: "Departments", icon: Building2 },
    { key: "citizens", label: "Citizen Records", icon: Users },
  ];
  const common = { departments, citizenName, onOpen: setSelected };

  return (
    <Sidebar variant="admin" portalLabel="Central Government Portal" items={items} active={section} onChange={setSection} user={user} onLogout={onLogout}>
      {section === "overview" && (
        <>
          <PageTitle title="National Overview" subtitle={`Signed in as ${user.name}. Read-only view of all complaint records.`} />
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
            <ChartCard title="Complaints by category"><BarList data={categoryData} /></ChartCard>
            <ChartCard title="Resolution rate by department"><BarList color="#102a43" data={deptData.map((d) => ({ label: d.name, value: d.rate, display: `${d.rate}%` }))} /></ChartCard>
          </div>
        </>
      )}

      {section === "all" && <ComplaintManager title="All Complaints" subtitle="Search and filter every complaint (read-only)." base={complaints} {...common} />}

      {section === "departments" && (
        <>
          <PageTitle title="Departments" subtitle="Workload and resolution rate by department." />
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
        </>
      )}

      {section === "citizens" && (
        <>
          <PageTitle title="Citizen Records" subtitle={`${citizens.length} registered citizens.`} />
          <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Mobile</th><th className="p-3">Ward</th><th className="p-3">Joined</th><th className="p-3">Complaints</th></tr>
              </thead>
              <tbody>
                {citizens.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="p-3 font-medium text-ink">{c.name}</td>
                    <td className="p-3">{c.email}</td>
                    <td className="p-3">{c.mobile}</td>
                    <td className="p-3">{c.ward || "—"}</td>
                    <td className="p-3">{formatDate(c.joined)}</td>
                    <td className="p-3">{complaints.filter((x) => x.citizenId === c.id).length}</td>
                  </tr>
                ))}
                {!citizens.length && <tr><td colSpan={6} className="p-6 text-center text-muted">No citizens registered yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openComplaint && (
        <ComplaintDetails complaint={openComplaint} citizenName={citizenName[openComplaint.citizenId] ?? "Unknown"} isAdmin readOnly departments={departments} onClose={() => setSelected(null)} />
      )}
    </Sidebar>
  );
}
