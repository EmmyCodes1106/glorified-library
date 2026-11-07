"use client";

import { useActionState } from "react";
import { runNotificationsNow, type FormState } from "../actions";

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
        className="justify-self-start rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Scanning..." : "Run reminder scan now"}
      </button>
      <p className="text-xs text-gray-500">
        Processes upcoming-due reminders, overdue notices and the daily
        administrator alert. Safe to run repeatedly — already-sent reminders
        are skipped.
      </p>
      {state.message && (
        <p
          className={`text-sm ${
            state.ok ? "text-green-600" : "text-red-500"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
