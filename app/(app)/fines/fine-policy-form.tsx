"use client";

import { useActionState } from "react";
import { Scale } from "lucide-react";
import { updateFineSettings, type FormState } from "@/app/actions";

const initial: FormState = { message: "" };

export default function FinePolicyForm({
  enabled,
  finePerDay,
  fineGraceDays = 0,
}: {
  enabled: boolean;
  finePerDay: string;
  fineGraceDays?: number;
}) {
  const [state, action, pending] = useActionState(
    updateFineSettings,
    initial
  );

  return (
    <form
      action={action}
      className="card grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"
    >
      <div className="grid gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
            <Scale size={16} />
          </span>
          <div>
            <h2 className="font-semibold">Fine policy</h2>
            <p className="mt-1 text-sm text-muted">
              Charge a set amount for every day a loan is past due. Each
              overdue day is charged once, at the rate in force on that day.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={enabled}
              className="h-4 w-4"
            />
            Charge late-return fines
          </label>
          <label className="grid gap-1 text-sm">
            <span className="label">Daily fine</span>
            <input
              type="number"
              name="finePerDay"
              min={0}
              max={10000}
              step="0.01"
              required
              defaultValue={finePerDay}
              className="field w-32"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="label">Grace period (days)</span>
            <input
              type="number"
              name="fineGraceDays"
              min={0}
              max={30}
              step={1}
              required
              defaultValue={fineGraceDays}
              className="field w-32"
            />
          </label>
        </div>

        <p className="hint">
          A grace period waits that many days past the due date before the
          first charge. It applies to open loans the next time fines accrue.
        </p>

        <p className="hint">
          Turning fines off stops new charges; balances already on record stay
          payable or can be waived. Re-enabling starts charging from that day,
          never retroactively.
        </p>

        {state.message && (
          <p
            role={state.ok ? "status" : "alert"}
            className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}
          >
            {state.message}
          </p>
        )}
      </div>

      <button
        disabled={pending}
        className="btn btn-secondary justify-self-start lg:justify-self-end"
      >
        {pending ? "Saving..." : "Save policy"}
      </button>
    </form>
  );
}
