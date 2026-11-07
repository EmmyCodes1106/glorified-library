"use client";

import { useActionState } from "react";
import { updateCirculationSettings, type FormState } from "../actions";

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
    <form action={action} className="grid gap-3 rounded-lg border p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">Borrowing policy</h2>
        <p className="mt-1 text-sm text-gray-500">
          New loans use this period unless a different duration is entered at
          checkout. Each member also has their own borrowing limit.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Default period (days)</span>
          <input
            type="number"
            name="defaultLoanDays"
            min={1}
            max={365}
            required
            defaultValue={defaultLoanDays}
            className="w-28 rounded border bg-transparent p-2 text-sm"
          />
        </label>
        <button
          disabled={pending}
          className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save policy"}
        </button>
      </div>

      {state.message && (
        <p
          className={`text-sm ${state.ok ? "text-green-600" : "text-red-500"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
