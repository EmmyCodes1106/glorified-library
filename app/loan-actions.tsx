"use client";

import { useState, useActionState } from "react";
import { renewLoan, returnBook, type FormState } from "./actions";

const initial: FormState = { message: "" };

type Props = {
  loanId: number;
  durationDays: number;
  returned?: boolean;
};

export default function LoanActions({
  loanId,
  durationDays,
  returned = false,
}: Props) {
  const [lastAction, setLastAction] = useState<"return" | "renew" | null>(null);

  async function handleReturn(prev: FormState, formData: FormData) {
    setLastAction("return");
    return returnBook(prev, formData);
  }

  async function handleRenew(prev: FormState, formData: FormData) {
    setLastAction("renew");
    return renewLoan(prev, formData);
  }

  const [returnState, returnAction, returning] = useActionState(
    handleReturn,
    initial
  );
  const [renewState, renewAction, renewing] = useActionState(
    handleRenew,
    initial
  );

  if (returned) {
    return <span className="text-sm text-gray-500">Closed</span>;
  }

  const latest = lastAction === "renew" ? renewState : returnState;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <form action={returnAction}>
          <input type="hidden" name="loanId" value={loanId} />
          <button
            disabled={returning}
            className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          >
            {returning ? "Returning..." : "Record return"}
          </button>
        </form>

        <form action={renewAction} className="flex items-center gap-1">
          <input type="hidden" name="loanId" value={loanId} />
          <label htmlFor={`renew-days-${loanId}`} className="sr-only">
            Renewal length in days
          </label>
          <input
            id={`renew-days-${loanId}`}
            type="number"
            name="days"
            min={1}
            max={365}
            required
            defaultValue={durationDays}
            className="w-16 rounded border bg-transparent px-2 py-1 text-sm"
          />
          <button
            disabled={renewing}
            className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          >
            {renewing ? "Renewing..." : "Renew"}
          </button>
        </form>
      </div>

      {lastAction && latest.message && (
        <p
          className={`text-xs ${
            latest.ok ? "text-green-600" : "text-red-500"
          }`}
        >
          {latest.message}
        </p>
      )}
    </div>
  );
}
