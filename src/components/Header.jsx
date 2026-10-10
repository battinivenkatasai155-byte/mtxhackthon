import React, { useState } from "react";
import { ShieldCheck, Menu, X, ArrowLeft } from "lucide-react";

export function Logo({ light = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
        <ShieldCheck size={22} aria-hidden="true" />
      </div>
      <div className="leading-tight">
        <p className={`text-lg font-bold tracking-tight ${light ? "text-white" : "text-navy"}`}>
          Grievance<span className={light ? "text-gold" : "text-brand"}>IQ</span>
        </p>
        <p className={`hidden text-[11px] sm:block ${light ? "text-slate-300" : "text-muted"}`}>
          Smart Grievance Management. Stronger Communities.
        </p>
      </div>
    </div>
  );
}

const NAV = [
  { label: "Home", id: "home" },
  { label: "Services", id: "services" },
  { label: "How It Works", id: "how-it-works" },
  { label: "About", id: "about" },
  { label: "Help", id: "help" },
];

export default function Header({ onHome, onSignIn, onSignUp, onNavigate, minimal = false }) {
  const [open, setOpen] = useState(false);

  const go = (id) => {
    setOpen(false);
    onNavigate?.(id);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="h-1 w-full" style={{ background: "linear-gradient(90deg,#ff9933 0 33.3%,#ffffff 33.3% 66.6%,#138808 66.6%)" }} aria-hidden="true" />
      <div className="bg-navy text-[11px] text-slate-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5 sm:px-6 lg:px-8">
          <span>Citizen Grievance Redressal Portal</span>
          <span className="hidden sm:inline">Report. Track. Resolve.</span>
        </div>
      </div>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button onClick={onHome} aria-label="GrievanceIQ home" className="rounded-lg">
          <Logo />
        </button>

        {minimal ? (
          <button
            onClick={onHome}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-muted transition hover:bg-slate-100 hover:text-ink"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back to home
          </button>
        ) : (
          <>
            <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => go(n.id)}
                  className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-navy"
                >
                  {n.label}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              {onSignUp && (
                <button
                  onClick={onSignUp}
                  className="rounded-xl border border-navy px-4 py-2.5 text-sm font-semibold text-navy transition hover:bg-navy hover:text-white"
                >
                  Sign Up
                </button>
              )}
              <button
                onClick={onSignIn}
                className="rounded-xl bg-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-navy-light"
              >
                Sign In
              </button>
              <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="mobile-nav"
                aria-label={open ? "Close menu" : "Open menu"}
                className="rounded-lg p-2 text-ink hover:bg-slate-100 lg:hidden"
              >
                {open ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </>
        )}
      </div>

      {!minimal && open && (
        <nav id="mobile-nav" aria-label="Mobile navigation" className="border-t border-line bg-white px-4 py-3 lg:hidden">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => go(n.id)}
              className="block w-full rounded-lg px-3 py-3 text-left text-sm font-medium text-ink hover:bg-slate-50"
            >
              {n.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
