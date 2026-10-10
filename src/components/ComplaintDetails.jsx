import React, { useState } from "react";
import { MapPin, Calendar, Building2, Paperclip, Tag } from "lucide-react";
import Modal from "./Modal.jsx";
import { StatusBadge, PriorityBadge, STATUS_STYLES } from "./StatusBadge.jsx";
import { SelectInput, TextArea } from "./Field.jsx";
import { STATUSES, PRIORITIES, formatDate } from "../data/constants.js";

export function Timeline({ items }) {
  return (
    <ol className="relative space-y-6 border-l-2 border-line pl-6">
      {items.map((t, i) => {
        const hex = STATUS_STYLES[t.status]?.hex ?? "#64748b";
        return (
          <li key={i} className="relative">
            <span
              className="absolute -left-[33px] top-0.5 h-4 w-4 rounded-full border-2 border-white ring-2"
              style={{ background: hex, "--tw-ring-color": hex }}
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={t.status} />
              <time className="text-xs text-muted" dateTime={t.date}>{formatDate(t.date)}</time>
            </div>
            <p className="mt-1.5 text-sm text-slate-700">{t.note}</p>
          </li>
        );
      })}
    </ol>
  );
}

function Meta({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="text-sm text-ink">{children}</p>
      </div>
    </div>
  );
}

export default function ComplaintDetails({ complaint, citizenName, isAdmin, readOnly, departments, onClose, onUpdate }) {
  const [status, setStatus] = useState(complaint.status);
  const [department, setDepartment] = useState(complaint.department);
  const [priority, setPriority] = useState(complaint.priority);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onUpdate(complaint.id, { status, department, priority, note: note.trim() });
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  const unchanged = status === complaint.status && department === complaint.department && priority === complaint.priority && !note.trim();

  return (
    <Modal title={complaint.title} subtitle={`${complaint.id}${isAdmin ? ` · Submitted by ${citizenName}` : ""}`} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={complaint.status} />
        {isAdmin && <PriorityBadge priority={complaint.priority} />}
      </div>

      {complaint.description && <p className="mt-4 text-sm leading-6 text-slate-700">{complaint.description}</p>}

      <div className="mt-5 grid gap-4 rounded-2xl bg-canvas p-4 sm:grid-cols-2">
        <Meta icon={Tag} label="Category">{complaint.category}</Meta>
        <Meta icon={Building2} label="Department">{complaint.department}</Meta>
        <Meta icon={MapPin} label="Location">{complaint.location}</Meta>
        <Meta icon={Calendar} label="Submitted">{formatDate(complaint.date)}</Meta>
        {complaint.attachmentName && (
          <Meta icon={Paperclip} label="Attachment">
            <a href={`/api/complaints/${encodeURIComponent(complaint.id)}/attachment`} className="font-semibold text-brand underline hover:text-brand-dark">
              {complaint.attachmentName}
            </a>
          </Meta>
        )}
      </div>

      <h3 className="mt-7 text-sm font-bold uppercase tracking-wide text-navy">Status timeline</h3>
      <div className="mt-4 pl-2">
        <Timeline items={complaint.timeline} />
      </div>

      {isAdmin && !readOnly && (
        <form onSubmit={save} className="mt-8 space-y-4 rounded-2xl border border-line p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-navy">Administrative actions</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectInput id="detail-status" label="Update status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUSES} />
            <SelectInput id="detail-priority" label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} options={PRIORITIES} />
            <SelectInput id="detail-dept" label="Assign department" value={department} onChange={(e) => setDepartment(e.target.value)} options={departments.map((d) => d.name)} />
          </div>
          <TextArea
            id="detail-note"
            label="Administrative note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add an internal note for the timeline"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={unchanged || busy}
              className="rounded-xl bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save changes
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
