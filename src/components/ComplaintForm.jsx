import React, { useState } from "react";
import { Paperclip, Send } from "lucide-react";
import { TextInput, SelectInput, TextArea } from "./Field.jsx";
import { InlineMessage } from "./Toast.jsx";
import { CATEGORIES, CATEGORY_DEPARTMENT, TODAY } from "../data/constants.js";

const EMPTY = (departments) => ({
  title: "",
  description: "",
  category: CATEGORIES[0],
  department: CATEGORY_DEPARTMENT[CATEGORIES[0]] ?? departments[0]?.name ?? "",
  location: "",
  date: TODAY,
  attachmentName: "",
});

const MAX_FILE = 2 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];

export default function ComplaintForm({ departments, onSubmit }) {
  const [form, setForm] = useState(() => EMPTY(departments));
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [fileKey, setFileKey] = useState(0);

  const set = (key) => (e) => {
    const value = e.target.value;
    setErrors((er) => ({ ...er, [key]: undefined }));
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "category" && departments.some((d) => d.name === CATEGORY_DEPARTMENT[value])) {
        next.department = CATEGORY_DEPARTMENT[value];
      }
      return next;
    });
  };

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (form.title.trim().length < 5) errs.title = "Enter a title of at least 5 characters.";
    if (form.description.trim().length < 20) errs.description = "Describe the issue in at least 20 characters.";
    if (!form.location.trim()) errs.location = "Enter the location or ward.";
    if (!form.date) errs.date = "Select the date of the issue.";
    else if (form.date > TODAY) errs.date = "The date cannot be in the future.";
    if (file && file.size > MAX_FILE) errs.file = "The file must be 2 MB or smaller.";
    else if (file && !ALLOWED.includes(file.type)) errs.file = "Attach a JPG, PNG or PDF file.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await onSubmit({ ...form, title: form.title.trim(), description: form.description.trim(), location: form.location.trim(), attachmentName: file?.name ?? "" }, file);
      setForm(EMPTY(departments));
      setFile(null);
      setFileKey((k) => k + 1);
    } catch (err) {
      setErrors(err.field ? { [err.field]: err.message } : { form: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
      {errors.form && <InlineMessage type="error">{errors.form}</InlineMessage>}

      <TextInput id="c-title" label="Complaint title" required value={form.title} onChange={set("title")} error={errors.title} placeholder="e.g. Streetlight not working on Main Road" />
      <TextArea id="c-desc" label="Complaint description" required rows={4} value={form.description} onChange={set("description")} error={errors.description} placeholder="Describe what happened, since when and how it affects you" />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectInput id="c-category" label="Category" required value={form.category} onChange={set("category")} options={CATEGORIES} />
        <SelectInput id="c-dept" label="Department" required value={form.department} onChange={set("department")} options={departments.map((d) => d.name)} hint="Suggested from the category. An administrator can reassign it." />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput id="c-location" label="Location or ward" required value={form.location} onChange={set("location")} error={errors.location} placeholder="Ward, street or landmark" />
        <TextInput id="c-date" type="date" label="Date of issue" required max={TODAY} value={form.date} onChange={set("date")} error={errors.date} />
      </div>

      <div>
        <label htmlFor="c-file" className="mb-1.5 block text-sm font-semibold text-ink">Attachment (optional)</label>
        <label
          htmlFor="c-file"
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-canvas px-4 py-4 text-sm text-muted transition hover:border-brand hover:text-ink focus-within:ring-4 focus-within:ring-brand/15"
        >
          <Paperclip size={18} aria-hidden="true" />
          <span>{file?.name || "Choose a photo or document"}</span>
        </label>
        <input
          key={fileKey}
          id="c-file"
          type="file"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setErrors((er) => ({ ...er, file: undefined }));
          }}
          accept="image/jpeg,image/png,application/pdf"
        />
        {errors.file ? (
          <p role="alert" className="mt-1 text-xs font-medium text-rose-700">{errors.file}</p>
        ) : (
          <p className="mt-1 text-xs text-muted">JPG, PNG or PDF, up to 2 MB.</p>
        )}
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60">
          <Send size={16} aria-hidden="true" /> {busy ? "Submitting…" : "Submit Complaint"}
        </button>
      </div>
    </form>
  );
}
