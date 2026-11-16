"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { addMember, type FormState } from "@/app/actions";

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
    <form action={action} className="card grid gap-4 p-5">
      <div>
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand"
            aria-hidden="true"
          >
            <UserPlus size={16} strokeWidth={2.5} />
          </span>
          <h2 className="font-semibold tracking-tight">Register a member</h2>
        </div>
        <p className="mt-2 text-sm text-muted">
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
        <label className="grid gap-1">
          <span className="label">Full name</span>
          <input
            name="name"
            required
            maxLength={160}
            autoComplete="name"
            placeholder="e.g. Ada Obi"
            className="field w-full"
          />
        </label>
        <label className="grid gap-1">
          <span className="label">Email address</span>
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="name@example.com"
            className="field w-full"
          />
        </label>
        <label className="grid gap-1">
          <span className="label">Phone number (optional)</span>
          <input
            name="phone"
            inputMode="tel"
            maxLength={20}
            autoComplete="tel"
            placeholder="e.g. 0801 234 5678"
            className="field w-full"
          />
        </label>
        <label className="grid gap-1">
          <span className="label">Borrowing limit (books)</span>
          <input
            name="loanLimit"
            type="number"
            min={0}
            max={maxLimit}
            required
            defaultValue={defaultLimit}
            className="field w-full"
          />
          <span className="hint">
            Up to {maxLimit} {maxLimit === 1 ? "book" : "books"}.
          </span>
        </label>
        <label className="grid gap-1 sm:col-span-2">
          <span className="label">Address (optional)</span>
          <textarea
            name="address"
            rows={2}
            maxLength={500}
            autoComplete="street-address"
            placeholder="Street, city, state"
            className="field w-full"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn btn-primary">
          {pending ? "Registering..." : "Register member"}
        </button>
        {state.message && (
          <p
            role={state.ok ? "status" : "alert"}
            className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
