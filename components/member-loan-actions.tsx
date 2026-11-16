"use client";

import { useActionState } from "react";
import { renewMyLoan, type MemberFormState } from "@/app/member-actions";

const initial: MemberFormState = { message: "" };

export default function MemberLoanActions({
  loanId,
  overdue,
  disabled = false,
}: {
  loanId: number;
  overdue: boolean;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(renewMyLoan, initial);

  if (overdue) {
    return (
      <p className="text-xs text-danger">
        Overdue — contact the library to renew.
      </p>
    );
  }

  if (disabled) {
    return <span className="badge badge-neutral">Renewal unavailable</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <form action={action}>
        <input type="hidden" name="loanId" value={loanId} />
        <button disabled={pending} className="btn btn-sm btn-secondary">
          {pending ? "Renewing..." : "Renew loan"}
        </button>
      </form>
      {state.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`text-xs ${state.ok ? "text-success" : "text-danger"}`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
