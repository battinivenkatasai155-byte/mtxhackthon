import React, { useState } from "react";
import { Eye, EyeOff, ArrowLeft, ShieldCheck, Lock, UserRound, Building2, Landmark, ArrowRight } from "lucide-react";
import { TextInput } from "./Field.jsx";
import { InlineMessage } from "./Toast.jsx";
import { api } from "../api.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^[6-9]\d{9}$/;
const EMPLOYEE_RE = /^(ADM|CGOV)-\d{4}$/i;

function PasswordInput({ id, label, value, onChange, error, autoComplete, hint }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        <span className="text-rose-600" aria-hidden="true"> *</span>
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full rounded-xl border bg-white py-2.5 pl-3.5 pr-11 text-sm text-ink transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 ${
            error ? "border-rose-400" : "border-line hover:border-slate-300"
          }`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted hover:text-ink"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

export default function LoginPage({ portal, onLogin, onBack, initialMode = "login" }) {
  const isAdmin = portal === "admin";
  const isCentral = portal === "central";
  const isStaff = isAdmin || isCentral;
  const [mode, setMode] = useState(initialMode); // login | register | forgot
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ identifier: "", password: "", name: "", email: "", mobile: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
  };

  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    setMessage(null);
  };

  async function submitLogin(e) {
    e.preventDefault();
    const id = form.identifier.trim();
    const errs = {};

    if (!id) errs.identifier = isStaff ? "Enter your official email or employee ID." : "Enter your email or mobile number.";
    else if (isStaff && !(EMAIL_RE.test(id) || EMPLOYEE_RE.test(id))) errs.identifier = "Use a valid official email or employee ID.";
    else if (!isStaff && !(EMAIL_RE.test(id) || MOBILE_RE.test(id))) errs.identifier = "Enter a valid email or 10-digit mobile number.";

    if (!form.password) errs.password = "Enter your password.";
    else if (!isStaff && form.password.length < 8) errs.password = "Password must be at least 8 characters.";

    setErrors(errs);
    if (Object.keys(errs).length) {
      setMessage({ type: "error", text: "Please correct the highlighted fields." });
      return;
    }

    setBusy(true);
    try {
      onLogin(await api.login(portal, id, form.password));
    } catch (err) {
      setMessage({ type: "error", text: err.message });
      setBusy(false);
    }
  }

  async function submitRegister(e) {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 3) errs.name = "Enter your full name (at least 3 characters).";
    if (!EMAIL_RE.test(form.email.trim())) errs.email = "Enter a valid email address.";
    if (!isAdmin && !MOBILE_RE.test(form.mobile.trim())) errs.mobile = "Enter a valid 10-digit mobile number.";
    if (form.password.length < (isAdmin ? 10 : 8)) errs.password = `Password must be at least ${isAdmin ? 10 : 8} characters.`;
    if (form.confirm !== form.password) errs.confirm = "Passwords do not match.";

    setErrors(errs);
    if (Object.keys(errs).length) {
      setMessage({ type: "error", text: "Please correct the highlighted fields." });
      return;
    }

    setBusy(true);
    try {
      if (isAdmin) await api.registerAdmin({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      else await api.register({ name: form.name.trim(), email: form.email.trim(), mobile: form.mobile.trim(), password: form.password });
      setForm((f) => ({ ...f, identifier: form.email.trim(), password: "", confirm: "" }));
      setMode("login");
      setErrors({});
      setMessage({ type: "success", text: "Account created. You can now sign in." });
    } catch (err) {
      if (err.field) setErrors({ [err.field]: err.message });
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  function submitForgot(e) {
    e.preventDefault();
    const id = form.identifier.trim();
    if (!id || !(EMAIL_RE.test(id) || (isAdmin && EMPLOYEE_RE.test(id)) || (!isAdmin && MOBILE_RE.test(id)))) {
      setErrors({ identifier: "Enter a valid account identifier." });
      return;
    }
    setErrors({});
    setMessage({
      type: "info",
      text: isAdmin
        ? "Administrator passwords are reset by the system administrator. Please contact your IT administrator."
        : "Online password reset is not yet available. Please contact the helpdesk to have your password reset.",
    });
  }

  const Icon = isCentral ? Landmark : isAdmin ? Building2 : UserRound;

  return (
    <main id="main" className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-stretch gap-0 px-4 py-8 sm:px-6 lg:grid-cols-5 lg:py-12">
      <aside
        className={`hidden flex-col justify-between rounded-l-3xl p-10 lg:col-span-2 lg:flex ${
          isStaff ? "bg-navy text-white" : "bg-brand text-white"
        }`}
      >
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
            <Icon size={24} className={isStaff ? "text-gold" : "text-white"} aria-hidden="true" />
          </div>
          <p className={`mt-6 text-xs font-bold uppercase tracking-widest ${isStaff ? "text-gold" : "text-teal-100"}`}>
            {isCentral ? "Single authorised official" : isAdmin ? "Authorised personnel only" : "Citizen access"}
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight">
            {isCentral ? "Central Government Portal" : isAdmin ? "Administration Portal" : "Citizen Portal"}
          </h1>
          <p className="mt-4 text-sm leading-6 text-white/80">
            {isCentral
              ? "Read-only national oversight of complaints, departments and resolution performance. Access is limited to one authorised official."
              : isAdmin
              ? "Manage complaints, assign departments and monitor resolution performance. Access is restricted to authorised personnel."
              : "Submit civic complaints, track their progress and receive status updates in one place."}
          </p>
        </div>
        <div className="rounded-2xl bg-white/10 p-4 text-xs leading-5 text-white/85">
          <p className="flex items-center gap-2 font-semibold">
            <Lock size={14} aria-hidden="true" /> Secure sign-in
          </p>
          <p className="mt-1">
            {isCentral
              ? "This portal has a single login issued by the organisation. Sign-in attempts are rate-limited."
              : isAdmin
              ? "Administrator accounts are issued by the organisation. Sign-in attempts are rate-limited."
              : "Your password is stored securely and your session is protected. Never share your password."}
          </p>
        </div>
      </aside>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-10 lg:col-span-3 lg:rounded-l-none">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft size={16} aria-hidden="true" /> Back to portal selection
        </button>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              isStaff ? "bg-navy text-gold" : "bg-teal-50 text-brand"
            }`}
          >
            <ShieldCheck size={13} aria-hidden="true" />
            {isCentral ? "Central Government Portal" : isAdmin ? "Administration Portal" : "Citizen Portal"}
          </span>
        </div>

        <h2 className="mt-4 text-2xl font-bold text-navy">
          {mode === "register" ? (isAdmin ? "Create an administrator account" : "Create a citizen account") : mode === "forgot" ? "Reset your password" : isCentral ? "Central Government sign in" : isAdmin ? "Administrator sign in" : "Sign in to your account"}
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          {mode === "register"
            ? isAdmin
              ? "Only email addresses authorised by the organisation can register."
              : "Create your account to submit and track civic complaints."
            : mode === "forgot"
            ? "Enter your account identifier."
            : isStaff
            ? "Enter your official email or employee ID."
            : "Use your email or mobile number."}
        </p>

        {message && (
          <div className="mt-5">
            <InlineMessage type={message.type}>{message.text}</InlineMessage>
          </div>
        )}

        {mode === "login" && (
          <form onSubmit={submitLogin} noValidate className="mt-6 space-y-5">
            <TextInput
              id="identifier"
              label={isStaff ? "Official email or employee ID" : "Email or mobile number"}
              value={form.identifier}
              onChange={set("identifier")}
              error={errors.identifier}
              autoComplete="username"
              placeholder={isCentral ? "name@gov.example" : isAdmin ? "ADM-1234 or name@department.example" : "you@example.com or 9876543210"}
              required
            />
            <PasswordInput id="password" label="Password" value={form.password} onChange={set("password")} error={errors.password} autoComplete="current-password" />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button type="button" onClick={() => switchMode("forgot")} className="rounded text-sm font-semibold text-brand hover:text-brand-dark">
                Forgot password?
              </button>
            </div>
            <button
              type="submit"
              disabled={busy}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 ${
                isStaff ? "bg-navy hover:bg-navy-light" : "bg-brand hover:bg-brand-dark"
              }`}
            >
              {busy ? "Signing in…" : isCentral ? "Sign in to Central Portal" : isAdmin ? "Sign in to Administration" : "Sign in"} <ArrowRight size={16} aria-hidden="true" />
            </button>

            {!isAdmin ? (
              <p className="text-center text-sm text-muted">
                New to GrievanceIQ?{" "}
                <button type="button" onClick={() => switchMode("register")} className="font-semibold text-brand hover:text-brand-dark">
                  Create an account
                </button>
              </p>
            ) : isCentral ? (
              <p className="text-center text-xs text-muted">This portal has one login, issued by the organisation. It cannot be registered here.</p>
            ) : (
              <p className="text-center text-sm text-muted">
                Authorised email?{" "}
                <button type="button" onClick={() => switchMode("register")} className="font-semibold text-brand hover:text-brand-dark">
                  Create an administrator account
                </button>
              </p>
            )}
          </form>
        )}

        {mode === "register" && (
          <form onSubmit={submitRegister} noValidate className="mt-6 space-y-5">
            <TextInput id="name" label="Full name" value={form.name} onChange={set("name")} error={errors.name} autoComplete="name" required />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextInput id="email" type="email" label="Email" value={form.email} onChange={set("email")} error={errors.email} autoComplete="email" required />
              {!isAdmin && <TextInput id="mobile" label="Mobile number" inputMode="numeric" maxLength={10} value={form.mobile} onChange={set("mobile")} error={errors.mobile} autoComplete="tel" required />}
            </div>
            <PasswordInput id="password" label="Password" value={form.password} onChange={set("password")} error={errors.password} autoComplete="new-password" hint={isAdmin ? "At least 10 characters." : "At least 8 characters."} />
            <PasswordInput id="confirm" label="Confirm password" value={form.confirm} onChange={set("confirm")} error={errors.confirm} autoComplete="new-password" />
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60">
              {busy ? "Creating account…" : isAdmin ? "Create administrator account" : "Create account"}
            </button>
            <p className="text-center text-sm text-muted">
              Already registered?{" "}
              <button type="button" onClick={() => switchMode("login")} className="font-semibold text-brand hover:text-brand-dark">
                Sign in
              </button>
            </p>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={submitForgot} noValidate className="mt-6 space-y-5">
            <TextInput
              id="identifier"
              label={isAdmin ? "Official email or employee ID" : "Email or mobile number"}
              value={form.identifier}
              onChange={set("identifier")}
              error={errors.identifier}
              required
            />
            <button type="submit" className="flex w-full items-center justify-center rounded-xl bg-navy py-3 text-sm font-semibold text-white transition hover:bg-navy-light">
              Request password reset
            </button>
            <p className="text-center text-sm text-muted">
              <button type="button" onClick={() => switchMode("login")} className="font-semibold text-brand hover:text-brand-dark">
                Back to sign in
              </button>
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
