"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { runNotificationsNow, type FormState } from "@/app/actions";

const initial: FormState = { message: "" };

export default function RunNotificationsForm() {
  const [state, action, pending] = useActionState(
    runNotificationsNow,
    initial
  );

  return (
    <form action={action} className="grid gap-2">
      <button
        disabled={pending}
        className="btn btn-secondary justify-self-start"
      >
        <RefreshCw
          size={15}
          className={pending ? "animate-spin" : undefined}
          aria-hidden="true"
        />
        {pending ? "Scanning..." : "Run reminder scan now"}
      </button>
      <p className="hint">
        Processes upcoming-due reminders, overdue notices and the daily
        administrator alert. Safe to run repeatedly — already-sent reminders
        are skipped.
      </p>
      {state.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
