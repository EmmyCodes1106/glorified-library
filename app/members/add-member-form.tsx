"use client";

import { useActionState } from "react";
import { addMember, type FormState } from "../actions";

const initial: FormState = { message: "" };

export default function AddMemberForm({
  defaultLimit = 5,
  maxLimit = 100,
  membershipMonths = 0,
}: {
  defaultLimit?: number;
  maxLimit?: number;
  membershipMonths?: number;
} = {}) {
  const [state, action, pending] = useActionState(addMember, initial);

  return (
    <form
      action={action}
      className="mb-6 grid gap-3 rounded-lg border p-4 sm:p-5"
    >
      <div>
        <h2 className="font-semibold">Register a member</h2>
        <p className="mt-1 text-sm text-gray-500">
          Full name and email are required. A member ID is generated
          automatically. The borrowing limit caps how many books the member can
          have out at once.
          {membershipMonths > 0
            ? ` Membership is valid for ${membershipMonths} ${
                membershipMonths === 1 ? "month" : "months"
              } from registration.`
            : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Full name</span>
          <input
            name="name"
            required
            maxLength={160}
            autoComplete="name"
            placeholder="e.g. Ada Obi"
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Email address</span>
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="name@example.com"
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Phone number (optional)</span>
          <input
            name="phone"
            inputMode="tel"
            maxLength={20}
            autoComplete="tel"
            placeholder="e.g. 0801 234 5678"
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Borrowing limit (books)</span>
          <input
            name="loanLimit"
            type="number"
            min={0}
            max={maxLimit}
            required
            defaultValue={defaultLimit}
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
          <span className="text-xs text-gray-500">
            Up to {maxLimit} {maxLimit === 1 ? "book" : "books"}.
          </span>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Address (optional)</span>
          <textarea
            name="address"
            rows={2}
            maxLength={500}
            autoComplete="street-address"
            placeholder="Street, city, state"
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
        >
          {pending ? "Registering..." : "Register member"}
        </button>
        {state.message && (
          <p
            className={`text-sm ${state.ok ? "text-green-600" : "text-red-500"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
