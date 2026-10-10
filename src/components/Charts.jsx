import React from "react";
import { STATUS_STYLES } from "./StatusBadge.jsx";

export function DonutChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let acc = 0;
  const stops = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const start = (acc / total) * 100;
      acc += d.value;
      return `${STATUS_STYLES[d.label]?.hex ?? d.color} ${start}% ${(acc / total) * 100}%`;
    })
    .join(", ");

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div
        role="img"
        aria-label={`Status distribution: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
        className="relative h-40 w-40 shrink-0 rounded-full"
        style={{ background: total ? `conic-gradient(${stops})` : "#e2e8f0" }}
      >
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white">
          <span className="text-2xl font-bold text-navy">{total}</span>
          <span className="text-xs text-muted">Total</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_STYLES[d.label]?.hex }} aria-hidden="true" />
              {d.label}
            </span>
            <span className="font-semibold text-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarList({ data, color = "#0f766e" }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-slate-700">{d.label}</span>
            <span className="font-semibold text-ink">{d.display ?? d.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="presentation">
            <div className="h-full rounded-full transition-all" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TrendChart({ data }) {
  const w = 320;
  const h = 140;
  const pad = 24;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => [pad + i * step, h - pad - (d.value / max) * (h - pad * 2)]);
  const line = pts.map((p) => p.join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Complaints per month: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`} className="h-auto w-full">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e2e8f0" />
      {pts.length > 1 && <polyline points={line} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {pts.map(([x, y], i) => (
        <g key={data[i].label}>
          <circle cx={x} cy={y} r="4" fill="#fff" stroke="#0f766e" strokeWidth="2" />
          <text x={x} y={y - 9} textAnchor="middle" fontSize="10" fontWeight="600" fill="#172b4d">{data[i].value}</text>
          <text x={x} y={h - 8} textAnchor="middle" fontSize="10" fill="#64748b">{data[i].label}</text>
        </g>
      ))}
    </svg>
  );
}

export function ChartCard({ title, subtitle, children }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-navy">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
