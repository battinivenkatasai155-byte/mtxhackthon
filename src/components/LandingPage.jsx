import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  Construction,
  Droplets,
  Trash2,
  Lightbulb,
  Siren,
  Landmark,
  FilePlus2,
  Search,
  RefreshCw,
  CheckCircle2,
  Inbox,
  CircleCheckBig,
  Building2,
} from "lucide-react";
import PortalSelection from "./PortalSelection.jsx";
import { api } from "../api.js";

const SERVICES = [
  { icon: Construction, title: "Roads and Infrastructure", text: "Potholes, damaged footpaths, broken road signs and construction hazards." },
  { icon: Droplets, title: "Water Supply", text: "Leakages, low pressure, contaminated water and supply interruptions." },
  { icon: Trash2, title: "Sanitation and Waste Management", text: "Missed garbage collection, overflowing drains and public cleanliness." },
  { icon: Lightbulb, title: "Streetlights", text: "Non-working, flickering or damaged streetlights in your neighbourhood." },
  { icon: Siren, title: "Public Safety", text: "Broken CCTV, unsafe public spaces, stray animals and other safety concerns." },
  { icon: Landmark, title: "Other Civic Services", text: "Delays in civic paperwork and any issue that does not fit another category." },
];

const STEPS = [
  { icon: FilePlus2, title: "Submit", text: "Describe the issue, choose a category and add the location." },
  { icon: Search, title: "Review", text: "An administrator reviews the complaint and assigns a department." },
  { icon: RefreshCw, title: "Track", text: "Follow every status change on a clear timeline." },
  { icon: CircleCheckBig, title: "Resolve", text: "See the outcome once the issue is resolved or closed." },
];

const FAQS = [
  { q: "How do I report an issue?", a: "Create a citizen account, sign in and choose Submit New Complaint. You receive a complaint ID to track it." },
  { q: "Who handles my complaint?", a: "Authorised administrators review each complaint, assign it to the right department and update its status." },
  { q: "Is my information secure?", a: "Accounts are protected by hashed passwords and secure sessions. Citizens can only see their own complaints." },
  { q: "Who can access the Administration Portal?", a: "Only authorised staff with accounts issued by the organisation. Administrator accounts cannot be created from this website." },
];

function HeroVisual() {
  return (
    <svg viewBox="0 0 480 420" role="img" aria-label="Illustration of a city with a shield and a complaint tracker" className="h-auto w-full">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6f2f1" />
          <stop offset="1" stopColor="#f5f7fa" />
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="460" height="400" rx="32" fill="url(#sky)" stroke="#e2e8f0" />
      <circle cx="370" cy="90" r="34" fill="#d6a84f" opacity="0.35" />
      <g fill="#102a43">
        <rect x="50" y="230" width="60" height="130" rx="6" opacity="0.9" />
        <rect x="120" y="180" width="70" height="180" rx="6" />
        <rect x="200" y="250" width="55" height="110" rx="6" opacity="0.8" />
        <rect x="330" y="210" width="70" height="150" rx="6" opacity="0.9" />
        <rect x="410" y="270" width="40" height="90" rx="6" opacity="0.7" />
      </g>
      <g fill="#f5f7fa" opacity="0.75">
        {[200, 232, 264, 296].map((y) => (
          <React.Fragment key={y}>
            <rect x="136" y={y} width="12" height="14" rx="2" />
            <rect x="162" y={y} width="12" height="14" rx="2" />
          </React.Fragment>
        ))}
        {[250, 285, 320].map((y) => (
          <React.Fragment key={y}>
            <rect x="346" y={y} width="12" height="14" rx="2" />
            <rect x="372" y={y} width="12" height="14" rx="2" />
          </React.Fragment>
        ))}
      </g>
      <rect x="20" y="360" width="440" height="30" rx="8" fill="#0f766e" opacity="0.15" />
      <path d="M265 120 l62 -24 62 24 v52 c0 42 -28 70 -62 84 c-34 -14 -62 -42 -62 -84 z" fill="#0f766e" />
      <path d="M300 178 l20 20 l36 -40" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <g>
        <rect x="40" y="60" width="170" height="86" rx="16" fill="#fff" stroke="#e2e8f0" />
        <circle cx="66" cy="88" r="9" fill="#0f766e" />
        <rect x="84" y="82" width="90" height="8" rx="4" fill="#102a43" opacity="0.8" />
        <rect x="56" y="108" width="138" height="6" rx="3" fill="#e2e8f0" />
        <rect x="56" y="108" width="92" height="6" rx="3" fill="#d6a84f" />
        <rect x="56" y="124" width="60" height="6" rx="3" fill="#e2e8f0" />
      </g>
    </svg>
  );
}

export default function LandingPage({ onGetStarted, onSelectPortal }) {
  const [counts, setCounts] = useState(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const services = q ? SERVICES.filter((s) => `${s.title} ${s.text}`.toLowerCase().includes(q)) : SERVICES;
  const faqs = q ? FAQS.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(q)) : [];
  useEffect(() => {
    api.publicStats().then(setCounts).catch(() => {});
  }, []);
  const show = (v) => (counts ? v.toLocaleString("en-IN") : "-");
  const stats = [
    { icon: Inbox, label: "Complaints received", value: show(counts?.received) },
    { icon: CheckCircle2, label: "Issues resolved", value: show(counts?.resolved) },
    { icon: Building2, label: "Departments", value: show(counts?.departments) },
  ];

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div>
      <section id="home" className="border-b-4 border-gold bg-navy">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-gold/60 bg-gold/15 px-3 py-1 text-xs font-semibold text-gold">
              Smart civic grievance management
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
              Your Voice Matters. Let’s Build a Better Community.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
              Report potholes, water leaks, waste, broken streetlights and other civic issues in one
              place, then follow each complaint from submission to resolution with a clear status timeline.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={onGetStarted}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
              >
                Get Started <ArrowRight size={16} aria-hidden="true" />
              </button>
              <button
                onClick={() => scrollTo("services")}
                className="rounded-xl border border-white/40 bg-transparent px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Explore Services
              </button>
            </div>

            <form role="search" onSubmit={(e) => { e.preventDefault(); document.getElementById("services")?.scrollIntoView({ behavior: "smooth" }); }} className="mt-8 flex max-w-xl overflow-hidden rounded-xl border border-line bg-white shadow-sm focus-within:ring-4 focus-within:ring-brand/15">
              <label htmlFor="site-search" className="sr-only">Search services and help</label>
              <Search size={18} className="my-auto ml-4 shrink-0 text-muted" aria-hidden="true" />
              <input id="site-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services, e.g. streetlight, garbage, road" className="w-full px-3 py-3 text-sm text-ink focus:outline-none" />
              <button type="submit" className="bg-navy px-5 text-sm font-semibold text-white hover:bg-navy-light">Search</button>
            </form>

            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl border border-line bg-canvas p-4">
                  <s.icon size={18} className="text-brand" aria-hidden="true" />
                  <p className="mt-2 text-2xl font-bold text-navy">{s.value}</p>
                  <p className="text-xs font-medium text-muted">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-lg">
            <HeroVisual />
          </div>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">Services</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy">Find the right service for your issue</h2>
          <p className="mt-3 text-muted">Pick a category to report a problem. Sign in to the Citizen Portal to continue.</p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <article key={s.title} className="flex flex-col rounded-2xl border border-line bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-brand">
                <s.icon size={24} aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-navy">{s.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted">{s.text}</p>
              <button
                onClick={() => onSelectPortal("citizen")}
                className="mt-5 inline-flex items-center gap-2 self-start text-sm font-semibold text-brand hover:text-brand-dark"
              >
                Report an issue <ArrowRight size={15} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
        {q && services.length === 0 && faqs.length === 0 && (
          <p className="mt-6 rounded-xl border border-line bg-white p-6 text-center text-sm text-muted">No services match "{query}". Try another word such as road, water or garbage.</p>
        )}
        {faqs.length > 0 && (
          <div className="mt-8 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-brand">Help results</h3>
            {faqs.map((f) => (
              <div key={f.q} className="rounded-xl border border-line bg-white p-4"><p className="font-semibold text-navy">{f.q}</p><p className="mt-1 text-sm text-muted">{f.a}</p></div>
            ))}
          </div>
        )}
      </section>

      <div className="border-y border-line bg-white">
        <PortalSelection onSelect={onSelectPortal} />
      </div>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">How it works</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy">From report to resolution in four steps</h2>
        </div>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-white">
                  <s.icon size={20} aria-hidden="true" />
                </div>
                <span className="text-sm font-bold text-gold">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold text-navy">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="about" className="bg-navy">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-gold">About GrievanceIQ</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Clear, accountable civic communication</h2>
          </div>
          <p className="leading-7 text-slate-300">
            GrievanceIQ makes reporting civic issues simple for citizens and manageable for administrators. Every complaint is recorded, routed to a department and tracked through a transparent status timeline until it is resolved.
          </p>
        </div>
      </section>

      <section id="help" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">Help</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy">Frequently asked questions</h2>
        </div>
        <div className="mt-8 space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-line bg-white p-5 shadow-sm open:shadow-md">
              <summary className="cursor-pointer list-none font-semibold text-navy marker:content-none">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-brand transition group-open:rotate-45" aria-hidden="true">+</span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
