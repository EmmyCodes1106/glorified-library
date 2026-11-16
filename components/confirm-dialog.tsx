"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle } from "lucide-react";

export function DialogSubmit({
  children,
  pendingLabel,
  tone = "danger",
}: {
  children: ReactNode;
  pendingLabel: string;
  tone?: "danger" | "primary";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export default function ConfirmDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close.current();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("button")?.focus();

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      opener.current?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/55"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-pop"
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
            aria-hidden="true"
          >
            <AlertTriangle size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="font-semibold tracking-tight">
              {title}
            </h2>
            <div className="mt-1 text-sm text-muted">{description}</div>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
