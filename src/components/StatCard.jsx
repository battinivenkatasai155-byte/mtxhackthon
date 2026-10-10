import React from "react";

export default function StatCard({ title, value, icon: Icon, tone = "brand", hint }) {
  const tones = {
    brand: "bg-teal-50 text-brand",
    navy: "bg-slate-100 text-navy",
    sky: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
  };
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon size={20} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-sm font-medium text-muted">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
