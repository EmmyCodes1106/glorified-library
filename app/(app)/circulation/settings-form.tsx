"use client";

import { useActionState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { updateCirculationSettings, type FormState } from "@/app/actions";

const initial: FormState = { message: "" };

export default function SettingsForm({
  defaultLoanDays,
}: {
  defaultLoanDays: number;
}) {
  const [state, action, pending] = useActionState(
    updateCirculationSettings,
    initial
  );

  return (
    <form action={action} className="card grid gap-4 p-5">
      <div>
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand"
            aria-hidden="true"
          >
            <SlidersHorizontal size={16} strokeWidth={2.5} />
          </span>
          <h2 className="font-semibold tracking-tight">Borrowing policy</h2>
        </div>
        <p className="mt-2 text-sm text-muted">
          New loans use this period unless a different duration is entered at
          checkout. Each member also has their own borrowing limit.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          <span className="label">Default period (days)</span>
          <input
            type="number"
            name="defaultLoanDays"
            min={1}
            max={365}
            required
            defaultValue={defaultLoanDays}
            className="field w-28"
          />
        </label>
        <button disabled={pending} className="btn btn-secondary">
          {pending ? "Saving..." : "Save policy"}
        </button>
      </div>

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
