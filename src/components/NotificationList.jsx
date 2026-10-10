import React from "react";
import { Bell, BellOff } from "lucide-react";
import { EmptyState } from "./Field.jsx";
import { formatDate } from "../data/constants.js";

export default function NotificationList({ items, onMarkAllRead }) {
  const unread = items.filter((n) => !n.read).length;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{unread} unread</p>
        {unread > 0 && (
          <button onClick={onMarkAllRead} className="text-sm font-semibold text-brand hover:text-brand-dark">
            Mark all as read
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={BellOff} title="No notifications" text="Updates about complaints will appear here." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          {items.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 p-4 ${n.read ? "" : "bg-teal-50/50"}`}>
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${n.read ? "bg-slate-100 text-muted" : "bg-brand text-white"}`}>
                <Bell size={15} aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className={`text-sm ${n.read ? "text-slate-600" : "font-semibold text-ink"}`}>{n.text}</p>
                <p className="mt-0.5 text-xs text-muted">{formatDate(n.date)}</p>
              </div>
              {!n.read && <span className="mt-2 h-2 w-2 rounded-full bg-brand" aria-label="Unread" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PageTitle({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
