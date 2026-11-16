"use client";

import { useActionState } from "react";
import { BookUp } from "lucide-react";
import { lendBook, type FormState } from "@/app/actions";

const initial: FormState = { message: "" };

type Props = {
  books: { id: number; title: string }[];
  members: { id: number; name: string }[];
  defaultLoanDays: number;
};

export default function QuickLoanForm({
  books,
  members,
  defaultLoanDays,
}: Props) {
  const [state, action, pending] = useActionState(lendBook, initial);
  const canLend = books.length > 0 && members.length > 0;

  return (
    <form action={action} className="card grid min-w-0 gap-3 p-5">
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand"
          aria-hidden="true"
        >
          <BookUp size={16} strokeWidth={2.5} />
        </span>
        <h2 className="font-semibold tracking-tight">Record a loan</h2>
      </div>
      <p className="text-xs text-muted">
        Uses the {defaultLoanDays}-day circulation default.
      </p>
      <label className="grid gap-1">
        <span className="label">Book</span>
        <select
          name="bookId"
          defaultValue=""
          required
          disabled={!canLend}
          className="field w-full"
        >
          <option value="">Choose book...</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="label">Member</span>
        <select
          name="memberId"
          defaultValue=""
          required
          disabled={!canLend}
          className="field w-full"
        >
          <option value="">Choose member...</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <button disabled={pending || !canLend} className="btn btn-primary w-full">
        {pending ? "Recording..." : `Lend for ${defaultLoanDays} days`}
      </button>
      {!canLend && (
        <p className="text-sm text-muted">
          Add an available book and a member first.
        </p>
      )}
      {state.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
