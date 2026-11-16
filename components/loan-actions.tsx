"use client";

import { useState, useActionState } from "react";
import {
  renewLoan,
  returnBook,
  updateLoanDueDate,
  type FormState,
} from "@/app/actions";

const initial: FormState = { message: "" };

type Props = {
  loanId: number;
  durationDays: number;
  dueDate: string;
  returned?: boolean;
};

export default function LoanActions({
  loanId,
  durationDays,
  dueDate,
  returned = false,
}: Props) {
  const [lastAction, setLastAction] = useState<
    "return" | "renew" | "due" | null
  >(null);

  async function handleReturn(prev: FormState, formData: FormData) {
    setLastAction("return");
    return returnBook(prev, formData);
  }

  async function handleRenew(prev: FormState, formData: FormData) {
    setLastAction("renew");
    return renewLoan(prev, formData);
  }

  async function handleDueDate(prev: FormState, formData: FormData) {
    setLastAction("due");
    return updateLoanDueDate(prev, formData);
  }

  const [returnState, returnAction, returning] = useActionState(
    handleReturn,
    initial
  );
  const [renewState, renewAction, renewing] = useActionState(
    handleRenew,
    initial
  );
  const [dueState, dueAction, updatingDue] = useActionState(
    handleDueDate,
    initial
  );

  if (returned) {
    return <span className="badge badge-neutral">Closed</span>;
  }

  const latest =
    lastAction === "due"
      ? dueState
      : lastAction === "renew"
        ? renewState
        : returnState;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <form action={returnAction}>
          <input type="hidden" name="loanId" value={loanId} />
          <button
            disabled={returning}
            className="btn btn-sm btn-secondary"
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
            className="field field-sm w-16"
          />
          <button
            disabled={renewing}
            className="btn btn-sm btn-secondary"
          >
            {renewing ? "Renewing..." : "Renew"}
          </button>
        </form>
      </div>

      <form action={dueAction} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="loanId" value={loanId} />
        <label htmlFor={`loan-due-${loanId}`} className="sr-only">
          Due date
        </label>
        <input
          key={dueDate}
          id={`loan-due-${loanId}`}
          type="date"
          name="dueDate"
          required
          defaultValue={dueDate}
          className="field field-sm w-40"
        />
        <button
          disabled={updatingDue}
          className="btn btn-sm btn-secondary"
        >
          {updatingDue ? "Saving..." : "Set due date"}
        </button>
      </form>

      {lastAction && latest.message && (
        <p
          role={latest.ok ? "status" : "alert"}
          className={`text-xs ${
            latest.ok ? "text-success" : "text-danger"
          }`}
        >
          {latest.message}
        </p>
      )}
    </div>
  );
}
