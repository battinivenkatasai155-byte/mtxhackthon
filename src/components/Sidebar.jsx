import React, { useState } from "react";
import { Menu, X, LogOut, ShieldCheck } from "lucide-react";

export default function Sidebar({ variant, items, active, onChange, user, onLogout, children }) {
  const [open, setOpen] = useState(false);
  const dark = variant === "admin";

  const nav = (
    <nav aria-label={dark ? "Administration navigation" : "Citizen navigation"} className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {items.map((item) => {
        const current = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => {
              onChange(item.key);
              setOpen(false);
            }}
            aria-current={current ? "page" : undefined}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
              dark
                ? current
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
                : current
                ? "bg-teal-50 text-brand"
                : "text-slate-600 hover:bg-slate-50 hover:text-ink"
            }`}
          >
            <item.icon size={18} className={current && dark ? "text-gold" : ""} aria-hidden="true" />
            <span className="flex-1">{item.label}</span>
            {item.badge > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${dark ? "bg-gold text-navy" : "bg-brand text-white"}`}>
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const panel = (
    <div className={`flex h-full flex-col ${dark ? "bg-navy text-white" : "border-r border-line bg-white"}`}>
      <div className={`flex h-16 items-center gap-3 px-5 ${dark ? "border-b border-white/10" : "border-b border-line"}`}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
          <ShieldCheck size={20} aria-hidden="true" />
        </div>
        <div className="leading-tight">
          <p className="font-bold">
            Grievance<span className={dark ? "text-gold" : "text-brand"}>IQ</span>
          </p>
          <p className={`text-[11px] ${dark ? "text-gold" : "text-muted"}`}>{dark ? "Administration Portal" : "Citizen Portal"}</p>
        </div>
      </div>
      {nav}
      <div className={`p-3 ${dark ? "border-t border-white/10" : "border-t border-line"}`}>
        <div className="mb-2 px-3">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className={`truncate text-xs ${dark ? "text-slate-400" : "text-muted"}`}>{user.email}</p>
        </div>
        <button
          onClick={onLogout}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            dark ? "text-slate-300 hover:bg-white/5 hover:text-white" : "text-slate-600 hover:bg-slate-50 hover:text-ink"
          }`}
        >
          <LogOut size={18} aria-hidden="true" /> Logout
        </button>
      </div>
    </div>
  );

  const current = items.find((i) => i.key === active);

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{panel}</aside>

      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open navigation menu" aria-expanded={open} className="rounded-lg p-2 hover:bg-slate-100">
          <Menu size={22} />
        </button>
        <p className="text-sm font-semibold text-navy">{current?.label}</p>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${dark ? "bg-navy text-gold" : "bg-teal-50 text-brand"}`}>
          {dark ? "Admin" : "Citizen"}
        </span>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy/60" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-2xl">
            <button onClick={() => setOpen(false)} aria-label="Close navigation menu" className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-muted hover:bg-slate-100/20">
              <X size={20} className={dark ? "text-white" : "text-ink"} />
            </button>
            {panel}
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        {dark && (
          <div className="hidden items-center justify-between border-b border-line bg-white px-8 py-2.5 text-xs lg:flex">
            <span className="font-semibold text-navy">Administration Portal</span>
            <span className="text-muted">Authorised personnel only</span>
          </div>
        )}
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
