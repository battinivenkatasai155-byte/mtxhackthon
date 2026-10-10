import React from "react";

export const STATUS_STYLES = {
  Submitted: { cls: "bg-sky-50 text-sky-800 ring-sky-200", hex: "#0284c7" },
  "Under Review": { cls: "bg-indigo-50 text-indigo-800 ring-indigo-200", hex: "#6366f1" },
  "In Progress": { cls: "bg-amber-50 text-amber-800 ring-amber-200", hex: "#d97706" },
  Resolved: { cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", hex: "#059669" },
  Rejected: { cls: "bg-rose-50 text-rose-800 ring-rose-200", hex: "#be123c" },
};

const PRIORITY_STYLES = {
  High: "bg-rose-50 text-rose-800 ring-rose-200",
  Medium: "bg-amber-50 text-amber-800 ring-amber-200",
  Low: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.Submitted;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.hex }} aria-hidden="true" />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  );
}
