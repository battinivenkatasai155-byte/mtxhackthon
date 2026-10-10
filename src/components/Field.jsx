import React from "react";

export const inputCls = (error) =>
  `w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-400 transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 ${
    error ? "border-rose-400" : "border-line hover:border-slate-300"
  }`;

export function Field({ label, id, error, hint, required, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-rose-600" aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ id, label, error, hint, required, ...props }) {
  return (
    <Field label={label} id={id} error={error} hint={hint} required={required}>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputCls(error)}
        {...props}
      />
    </Field>
  );
}

export function SelectInput({ id, label, error, hint, required, options, ...props }) {
  return (
    <Field label={label} id={id} error={error} hint={hint} required={required}>
      <select id={id} aria-invalid={!!error} className={inputCls(error)} {...props}>
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>
            {o.label ?? o}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextArea({ id, label, error, hint, required, ...props }) {
  return (
    <Field label={label} id={id} error={error} hint={hint} required={required}>
      <textarea
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputCls(error)}
        {...props}
      />
    </Field>
  );
}

export function EmptyState({ icon: Icon, title, text }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-muted">
        <Icon size={22} aria-hidden="true" />
      </div>
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>
    </div>
  );
}
