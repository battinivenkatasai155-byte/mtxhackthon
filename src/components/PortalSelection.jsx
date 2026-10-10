import React from "react";
import { UserRound, Building2, Landmark, ArrowRight, CheckCircle2, Lock } from "lucide-react";

const PORTALS = [
  {
    key: "citizen",
    title: "Citizen Portal",
    icon: UserRound,
    tag: "For residents",
    text: "Report civic issues, follow progress with a clear timeline and stay informed with notifications.",
    points: ["Submit and track complaints", "Status timeline and alerts", "Register in under a minute"],
    cta: "Continue as Citizen",
    style: "bg-white border-line hover:border-brand",
    iconStyle: "bg-teal-50 text-brand",
  },
  {
    key: "admin",
    title: "Administration Portal",
    icon: Building2,
    tag: "Authorised staff only",
    text: "Review, prioritise and resolve complaints, manage departments and monitor analytics.",
    points: ["Complaint management", "Department assignment", "Reports and analytics"],
    cta: "Administrator Sign In",
    style: "bg-navy text-white border-navy hover:border-gold",
    iconStyle: "bg-white/10 text-gold",
  },
  {
    key: "central",
    title: "Central Government Portal",
    icon: Landmark,
    tag: "Single authorised login",
    text: "National oversight of every complaint, department and citizen record across the platform.",
    points: ["Read-only access to all data", "Nationwide analytics", "One authorised official only"],
    cta: "Central Government Sign In",
    style: "bg-white border-line hover:border-navy",
    iconStyle: "bg-navy text-gold",
  },
];

export default function PortalSelection({ onSelect, standalone = false }) {
  return (
    <section id="portals" className={standalone ? "mx-auto max-w-5xl px-4 py-16 sm:px-6" : "mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"}>
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand">Choose your portal</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy">Sign in to the right workspace</h2>
        <p className="mt-3 text-muted">
          Citizens, administrators and the Central Government use separate sign-in screens. Staff and government access requires
          authorised credentials.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {PORTALS.map((p) => {
          const dark = p.key === "admin";
          const locked = p.key !== "citizen";
          return (
            <button
              key={p.key}
              onClick={() => onSelect(p.key)}
              className={`group rounded-3xl border p-7 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${p.style}`}
            >
              <div className="flex items-center justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${p.iconStyle}`}>
                  <p.icon size={24} aria-hidden="true" />
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    dark ? "bg-gold/15 text-gold" : "bg-slate-100 text-muted"
                  }`}
                >
                  {locked && <Lock size={12} aria-hidden="true" />}
                  {p.tag}
                </span>
              </div>
              <h3 className="mt-6 text-xl font-bold">{p.title}</h3>
              <p className={`mt-2 text-sm leading-6 ${dark ? "text-slate-300" : "text-muted"}`}>{p.text}</p>
              <ul className="mt-5 space-y-2">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 size={16} className={dark ? "text-gold" : "text-brand"} aria-hidden="true" />
                    {pt}
                  </li>
                ))}
              </ul>
              <span className={`mt-7 inline-flex items-center gap-2 text-sm font-semibold ${dark ? "text-gold" : "text-brand"}`}>
                {p.cta}
                <ArrowRight size={16} className="transition group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
