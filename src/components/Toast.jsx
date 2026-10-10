import React from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

const STYLES = {
  success: { cls: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 },
  error: { cls: "border-rose-200 bg-rose-50 text-rose-900", icon: AlertTriangle },
  info: { cls: "border-sky-200 bg-sky-50 text-sky-900", icon: Info },
};

export function ToastContainer({ toasts, onDismiss }) {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => {
        const { cls, icon: Icon } = STYLES[t.type] ?? STYLES.info;
        return (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 text-sm shadow-lg ${cls}`}
          >
            <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p className="flex-1 font-medium">{t.message}</p>
            <button onClick={() => onDismiss(t.id)} aria-label="Dismiss notification" className="rounded p-0.5 hover:bg-black/5">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function InlineMessage({ type = "info", children }) {
  const { cls, icon: Icon } = STYLES[type] ?? STYLES.info;
  return (
    <div role={type === "error" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${cls}`}>
      <Icon size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
