import React from "react";
import { Eye, Inbox } from "lucide-react";
import { StatusBadge, PriorityBadge } from "./StatusBadge.jsx";
import { EmptyState } from "./Field.jsx";
import { formatDate } from "../data/constants.js";

export default function ComplaintTable({ complaints, variant = "citizen", citizenName = {}, onView, emptyText }) {
  const admin = variant === "admin";

  if (complaints.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No complaints found"
        text={emptyText ?? "No records match your search or filters. Try changing or clearing them."}
      />
    );
  }

  const th = "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted";
  const td = "px-4 py-3.5 text-sm text-slate-700";

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <caption className="sr-only">{admin ? "Complaint management table" : "My complaints"}</caption>
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className={th}>ID</th>
              {admin && <th scope="col" className={th}>Citizen</th>}
              <th scope="col" className={th}>Title</th>
              <th scope="col" className={th}>Category</th>
              {admin && <th scope="col" className={th}>Department</th>}
              {admin && <th scope="col" className={th}>Location</th>}
              {admin && <th scope="col" className={th}>Priority</th>}
              <th scope="col" className={th}>{admin ? "Submitted" : "Date"}</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {complaints.map((c) => (
              <tr key={c.id} className="transition hover:bg-slate-50/70">
                <td className={`${td} whitespace-nowrap font-mono text-xs font-semibold text-navy`}>{c.id}</td>
                {admin && <td className={`${td} whitespace-nowrap`}>{citizenName[c.citizenId] ?? "Unknown"}</td>}
                <td className={`${td} min-w-[200px] font-medium text-ink`}>{c.title}</td>
                <td className={`${td} min-w-[150px]`}>{c.category}</td>
                {admin && <td className={`${td} min-w-[150px]`}>{c.department}</td>}
                {admin && <td className={`${td} min-w-[130px]`}>{c.location}</td>}
                {admin && <td className={td}><PriorityBadge priority={c.priority} /></td>}
                <td className={`${td} whitespace-nowrap`}>{formatDate(c.date)}</td>
                <td className={td}><StatusBadge status={c.status} /></td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  <button
                    onClick={() => onView(c)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy transition hover:border-brand hover:text-brand"
                    aria-label={`${admin ? "View and update" : "View details of"} ${c.id}`}
                  >
                    <Eye size={14} aria-hidden="true" />
                    {admin ? "View / Update" : "View Details"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
