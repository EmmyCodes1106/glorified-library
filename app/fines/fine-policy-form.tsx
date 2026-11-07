"use client";

import { useActionState } from "react";
import { updateFineSettings, type FormState } from "../actions";

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
      className="grid gap-4 rounded-lg border p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"
    >
      <div className="grid gap-3">
        <div>
          <h2 className="font-semibold">Fine policy</h2>
          <p className="mt-1 text-sm text-gray-500">
            Charge a set amount for every day a loan is past due. Each overdue
            day is charged once, at the rate in force on that day.
          </p>
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
            <span className="text-gray-500">Daily fine</span>
            <input
              type="number"
              name="finePerDay"
              min={0}
              max={10000}
              step="0.01"
              required
              defaultValue={finePerDay}
              className="w-32 rounded border bg-transparent p-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Grace period (days)</span>
            <input
              type="number"
              name="fineGraceDays"
              min={0}
              max={30}
              step={1}
              required
              defaultValue={fineGraceDays}
              className="w-32 rounded border bg-transparent p-2 text-sm"
            />
          </label>
        </div>

        <p className="text-xs text-gray-500">
          A grace period waits that many days past the due date before the
          first charge. It applies to open loans the next time fines accrue.
        </p>

        <p className="text-xs text-gray-500">
          Turning fines off stops new charges; balances already on record stay
          payable or can be waived. Re-enabling starts charging from that day,
          never retroactively.
        </p>

        {state.message && (
          <p
            className={`text-sm ${state.ok ? "text-green-600" : "text-red-500"}`}
          >
            {state.message}
          </p>
        )}
      </div>

      <button
        disabled={pending}
        className="justify-self-start rounded border px-4 py-2 text-sm font-medium disabled:opacity-50 lg:justify-self-end"
      >
        {pending ? "Saving..." : "Save policy"}
      </button>
    </form>
  );
}
