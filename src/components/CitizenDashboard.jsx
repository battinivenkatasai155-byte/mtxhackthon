import React, { useMemo, useState } from "react";
import {
  LayoutDashboard,
  FilePlus2,
  ListChecks,
  MapPinned,
  Bell,
  UserRound,
  CircleHelp,
  ClipboardList,
  Send,
  Clock,
  CheckCircle2,
  Search,
  Plus,
} from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import StatCard from "./StatCard.jsx";
import ComplaintForm from "./ComplaintForm.jsx";
import ComplaintTable from "./ComplaintTable.jsx";
import ComplaintDetails, { Timeline } from "./ComplaintDetails.jsx";
import NotificationList, { PageTitle } from "./NotificationList.jsx";
import { StatusBadge } from "./StatusBadge.jsx";
import { TextInput, SelectInput, EmptyState, inputCls } from "./Field.jsx";
import { InlineMessage } from "./Toast.jsx";
import { STATUSES, formatDate } from "../data/constants.js";

const FAQS = [
  { q: "How do I submit a complaint?", a: "Open Submit New Complaint, fill in the details and select Submit Complaint. It appears in My Complaints immediately." },
  { q: "Who can see my complaint?", a: "Only you and the authorised administrators of the grievance desk can see your complaint and its attachment." },
  { q: "What do the statuses mean?", a: "Submitted: received. Under Review: being checked. In Progress: work has started. Resolved: completed. Rejected: closed, for example as a duplicate." },
  { q: "Are my details stored?", a: "Yes. Your account and complaints are stored on the GrievanceIQ server. Passwords are stored only as secure hashes." },
];

export default function CitizenDashboard({ user, complaints, notifications, departments, onSubmit, onMarkAllRead, onUpdateUser, onLogout, notify }) {
  const [section, setSection] = useState("overview");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [trackId, setTrackId] = useState("");
  const [trackError, setTrackError] = useState("");
  const [tracked, setTracked] = useState(null);
  const [profile, setProfile] = useState({ name: user.name, ward: user.ward ?? "" });

  const mine = useMemo(() => complaints.filter((c) => c.citizenId === user.id), [complaints, user.id]);
  const myNotes = useMemo(() => notifications.filter((n) => n.to === user.id), [notifications, user.id]);
  const unread = myNotes.filter((n) => !n.read).length;

  const counts = useMemo(
    () => ({
      total: mine.length,
      submitted: mine.filter((c) => c.status === "Submitted").length,
      progress: mine.filter((c) => c.status === "In Progress").length,
      resolved: mine.filter((c) => c.status === "Resolved").length,
    }),
    [mine]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine.filter(
      (c) =>
        (statusFilter === "All" || c.status === statusFilter) &&
        (!q || [c.id, c.title, c.category, c.location].join(" ").toLowerCase().includes(q))
    );
  }, [mine, query, statusFilter]);

  // Always show the latest data for an open complaint
  const openComplaint = selected ? complaints.find((c) => c.id === selected) : null;
  const trackedComplaint = tracked ? complaints.find((c) => c.id === tracked) : null;

  const items = [
    { key: "overview", label: "Dashboard", icon: LayoutDashboard },
    { key: "submit", label: "Submit New Complaint", icon: FilePlus2 },
    { key: "complaints", label: "My Complaints", icon: ListChecks, badge: 0 },
    { key: "track", label: "Track Complaint Status", icon: MapPinned },
    { key: "notifications", label: "Notifications", icon: Bell, badge: unread },
    { key: "profile", label: "Profile & Settings", icon: UserRound },
    { key: "help", label: "Help & Support", icon: CircleHelp },
  ];

  async function handleSubmit(data, file) {
    const id = await onSubmit(data, file);
    notify(`Complaint ${id} submitted successfully.`, "success");
    setSection("complaints");
  }

  function lookup(e) {
    e.preventDefault();
    const id = trackId.trim().toUpperCase();
    const found = mine.find((c) => c.id === id);
    if (!id) setTrackError("Enter a complaint ID, for example GIQ-1001.");
    else if (!found) setTrackError("No complaint with this ID was found in your account.");
    else {
      setTrackError("");
      setTracked(found.id);
      return;
    }
    setTracked(null);
  }

  async function saveProfile(e) {
    e.preventDefault();
    if (profile.name.trim().length < 3) {
      notify("Enter your full name (at least 3 characters).", "error");
      return;
    }
    try {
      await onUpdateUser({ name: profile.name.trim(), ward: profile.ward.trim(), mobile: user.mobile });
      notify("Profile updated.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <Sidebar variant="citizen" items={items} active={section} onChange={setSection} user={user} onLogout={onLogout}>
      {section === "overview" && (
        <>
          <PageTitle
            title={`Welcome, ${user.name.split(" ")[0]}`}
            subtitle="Here is an overview of your complaints."
            action={
              <button onClick={() => setSection("submit")} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark">
                <Plus size={16} aria-hidden="true" /> Submit New Complaint
              </button>
            }
          />
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm sm:flex-row sm:items-center">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy text-lg font-bold text-gold" aria-hidden="true">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-ink">{user.name}</p>
              <p className="text-sm text-muted">{user.email} · {user.mobile}</p>
            </div>
            <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-muted">{user.ward || "Ward not set"}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total Complaints" value={counts.total} icon={ClipboardList} tone="navy" />
            <StatCard title="Submitted" value={counts.submitted} icon={Send} tone="sky" />
            <StatCard title="In Progress" value={counts.progress} icon={Clock} tone="amber" />
            <StatCard title="Resolved" value={counts.resolved} icon={CheckCircle2} tone="emerald" />
          </div>
          <h2 className="mb-3 mt-8 text-lg font-semibold text-navy">My complaints ({mine.length})</h2>
          <ComplaintTable complaints={mine.slice().sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))} onView={(c) => setSelected(c.id)} emptyText="You have not submitted any complaints yet." />
        </>
      )}

      {section === "submit" && (
        <>
          <PageTitle title="Submit New Complaint" subtitle="Tell us about the civic issue you want to report." />
          <div className="max-w-3xl">
            <ComplaintForm departments={departments} onSubmit={handleSubmit} />
          </div>
        </>
      )}

      {section === "complaints" && (
        <>
          <PageTitle title="My Complaints" subtitle="All complaints submitted from your account." />
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input aria-label="Search my complaints" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by ID, title, category or location" className={`${inputCls(false)} pl-10`} />
            </div>
            <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls(false)} sm:w-52`}>
              {["All", ...STATUSES].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <ComplaintTable complaints={filtered} onView={(c) => setSelected(c.id)} emptyText={mine.length ? undefined : "You have not submitted any complaints yet."} />
        </>
      )}

      {section === "track" && (
        <>
          <PageTitle title="Track Complaint Status" subtitle="Enter a complaint ID to see its current status and history." />
          <form onSubmit={lookup} noValidate className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <TextInput id="track-id" label="Complaint ID" value={trackId} onChange={(e) => { setTrackId(e.target.value); setTrackError(""); }} error={trackError} placeholder="GIQ-1001" />
            </div>
            <button type="submit" className="rounded-xl bg-navy px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-light sm:mt-[1.7rem]">Track</button>
          </form>
          {trackedComplaint ? (
            <div className="mt-6 max-w-2xl rounded-2xl border border-line bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-semibold text-navy">{trackedComplaint.id}</p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">{trackedComplaint.title}</h2>
                  <p className="text-sm text-muted">{trackedComplaint.department} · Submitted {formatDate(trackedComplaint.date)}</p>
                </div>
                <StatusBadge status={trackedComplaint.status} />
              </div>
              <div className="mt-6 pl-2"><Timeline items={trackedComplaint.timeline} /></div>
            </div>
          ) : (
            !trackError && <div className="mt-6 max-w-2xl"><EmptyState icon={MapPinned} title="No complaint selected" text="Search with your complaint ID to view its timeline." /></div>
          )}
        </>
      )}

      {section === "notifications" && (
        <>
          <PageTitle title="Notifications" subtitle="Updates on your complaints." />
          <NotificationList items={myNotes} onMarkAllRead={() => onMarkAllRead(user.id)} />
        </>
      )}

      {section === "profile" && (
        <>
          <PageTitle title="Profile & Account Settings" subtitle="Manage your account details." />
          <form onSubmit={saveProfile} noValidate className="max-w-xl space-y-5 rounded-2xl border border-line bg-white p-6 shadow-sm">
            <TextInput id="p-name" label="Full name" value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} required />
            <TextInput id="p-email" label="Email" value={user.email} readOnly hint="Email cannot be changed." />
            <TextInput id="p-mobile" label="Mobile number" value={user.mobile} readOnly />
            <TextInput id="p-ward" label="Ward" value={profile.ward} onChange={(e) => setProfile((p) => ({ ...p, ward: e.target.value }))} placeholder="e.g. Ward 12" />
            <div className="flex justify-end">
              <button type="submit" className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark">Save profile</button>
            </div>
          </form>
        </>
      )}

      {section === "help" && (
        <>
          <PageTitle title="Help & Support" subtitle="Answers to common questions." />
          <div className="max-w-3xl space-y-3">
            <InlineMessage type="info">For issues with your account or a complaint, contact the grievance helpdesk of your municipal office, quoting your complaint ID.</InlineMessage>
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-line bg-white p-5 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-navy marker:content-none">
                  {f.q}
                  <span className="text-brand transition group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </>
      )}

      {openComplaint && (
        <ComplaintDetails complaint={openComplaint} citizenName={user.name} isAdmin={false} departments={departments} onClose={() => setSelected(null)} />
      )}
    </Sidebar>
  );
}
