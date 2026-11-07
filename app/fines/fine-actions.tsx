"use client";

import { useActionState, useState } from "react";
import {
  recordFinePayment,
  waiveFine,
  type FormState,
} from "../actions";

const initial: FormState = { message: "" };

type Props = {
  loanId: number;
  balance: string;
  today: string;
};

export default function FineActions({ loanId, balance, today }: Props) {
  const [mode, setMode] = useState<"none" | "payment" | "waiver">("none");
  const [lastAction, setLastAction] = useState<"payment" | "waiver" | null>(
    null
  );

  async function handlePayment(prev: FormState, formData: FormData) {
    setLastAction("payment");
    const result = await recordFinePayment(prev, formData);
    if (result.ok) setMode("none");
    return result;
  }

  async function handleWaiver(prev: FormState, formData: FormData) {
    setLastAction("waiver");
    const result = await waiveFine(prev, formData);
    if (result.ok) setMode("none");
    return result;
  }

  const [paymentState, paymentAction, paying] = useActionState(
    handlePayment,
    initial
  );
  const [waiverState, waiverAction, waiving] = useActionState(
    handleWaiver,
    initial
  );

  const latest = lastAction === "waiver" ? waiverState : paymentState;
  const settled = Number(balance) <= 0;
  const amount = settled ? "0.00" : Number(balance).toFixed(2);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {settled ? (
          <span className="text-sm text-gray-500">Settled</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                setMode(mode === "payment" ? "none" : "payment")
              }
              className="rounded border px-3 py-1 text-sm"
            >
              Record payment
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "waiver" ? "none" : "waiver")}
              className="rounded border px-3 py-1 text-sm"
            >
              Waive
            </button>
          </>
        )}
      </div>

      {mode === "payment" && !settled && (
        <form
          action={paymentAction}
          className="grid gap-2 rounded border p-2 text-xs"
        >
          <input type="hidden" name="loanId" value={loanId} />
          <label className="grid gap-1">
            <span className="text-gray-500">Amount</span>
            <input
              name="amount"
              type="number"
              min="0.01"
              max={amount}
              step="0.01"
              required
              defaultValue={amount}
              className="w-28 rounded border bg-transparent p-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-gray-500">Payment date</span>
            <input
              name="paidOn"
              type="date"
              required
              defaultValue={today}
              max={today}
              className="rounded border bg-transparent p-1"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={paying}
              className="rounded bg-white px-3 py-1 font-medium text-black disabled:opacity-50"
            >
              {paying ? "Saving..." : "Record payment"}
            </button>
            <button
              type="button"
              onClick={() => setMode("none")}
              className="underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "waiver" && !settled && (
        <form
          action={waiverAction}
          className="grid gap-2 rounded border p-2 text-xs"
        >
          <input type="hidden" name="loanId" value={loanId} />
          <label className="grid gap-1">
            <span className="text-gray-500">Amount</span>
            <input
              name="amount"
              type="number"
              min="0.01"
              max={amount}
              step="0.01"
              required
              defaultValue={amount}
              className="w-28 rounded border bg-transparent p-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-gray-500">Waiver date</span>
            <input
              name="waivedOn"
              type="date"
              required
              defaultValue={today}
              max={today}
              className="rounded border bg-transparent p-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-gray-500">Reason</span>
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              rows={2}
              placeholder="Why is this fine being waived?"
              className="w-full min-w-0 rounded border bg-transparent p-1"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={waiving}
              className="rounded border px-3 py-1 font-medium disabled:opacity-50"
            >
              {waiving ? "Saving..." : "Waive fine"}
            </button>
            <button
              type="button"
              onClick={() => setMode("none")}
              className="underline"
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-gray-500">
            The waiver and its reason are kept in the payment history.
          </p>
        </form>
      )}

      {lastAction && latest.message && (
        <p
          className={`text-xs ${latest.ok ? "text-green-600" : "text-red-500"}`}
        >
          {latest.message}
        </p>
      )}
    </div>
  );
}
