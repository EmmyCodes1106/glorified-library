"use client";

import { useActionState, useState } from "react";
import {
  recordFinePayment,
  waiveFine,
  type FormState,
} from "@/app/actions";

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
          <span className="badge badge-success">Settled</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                setMode(mode === "payment" ? "none" : "payment")
              }
              className="btn btn-sm btn-secondary"
            >
              Record payment
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "waiver" ? "none" : "waiver")}
              className="btn btn-sm btn-ghost"
            >
              Waive
            </button>
          </>
        )}
      </div>

      {mode === "payment" && !settled && (
        <form
          action={paymentAction}
          className="grid gap-3 rounded-lg border border-line bg-surface-2 p-3"
        >
          <input type="hidden" name="loanId" value={loanId} />
          <label className="grid gap-1">
            <span className="label">Amount</span>
            <input
              name="amount"
              type="number"
              min="0.01"
              max={amount}
              step="0.01"
              required
              defaultValue={amount}
              className="field field-sm w-32"
            />
          </label>
          <label className="grid gap-1">
            <span className="label">Payment date</span>
            <input
              name="paidOn"
              type="date"
              required
              defaultValue={today}
              max={today}
              className="field field-sm"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={paying} className="btn btn-primary btn-sm">
              {paying ? "Saving..." : "Record payment"}
            </button>
            <button
              type="button"
              onClick={() => setMode("none")}
              className="btn btn-sm btn-ghost"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "waiver" && !settled && (
        <form
          action={waiverAction}
          className="grid gap-3 rounded-lg border border-line bg-surface-2 p-3"
        >
          <input type="hidden" name="loanId" value={loanId} />
          <label className="grid gap-1">
            <span className="label">Amount</span>
            <input
              name="amount"
              type="number"
              min="0.01"
              max={amount}
              step="0.01"
              required
              defaultValue={amount}
              className="field field-sm w-32"
            />
          </label>
          <label className="grid gap-1">
            <span className="label">Waiver date</span>
            <input
              name="waivedOn"
              type="date"
              required
              defaultValue={today}
              max={today}
              className="field field-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="label">Reason</span>
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              rows={2}
              placeholder="Why is this fine being waived?"
              className="field field-sm w-full"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={waiving} className="btn btn-secondary btn-sm">
              {waiving ? "Saving..." : "Waive fine"}
            </button>
            <button
              type="button"
              onClick={() => setMode("none")}
              className="btn btn-sm btn-ghost"
            >
              Cancel
            </button>
          </div>
          <p className="hint">
            The waiver and its reason are kept in the payment history.
          </p>
        </form>
      )}

      {lastAction && latest.message && (
        <p
          role={latest.ok ? "status" : "alert"}
          className={`text-xs ${latest.ok ? "text-success" : "text-danger"}`}
        >
          {latest.message}
        </p>
      )}
    </div>
  );
}
