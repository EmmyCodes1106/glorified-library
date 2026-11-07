"use client";

import { useActionState } from "react";
import { lendBook, type FormState } from "../actions";

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
    <form action={action} className="mb-6 grid min-w-0 gap-3 rounded border p-4">
      <h2 className="font-medium">Record a loan</h2>
      <p className="text-xs text-gray-500">
        Uses the {defaultLoanDays}-day circulation default.
      </p>
      <select
        name="bookId"
        defaultValue=""
        required
        disabled={!canLend}
        className="w-full min-w-0 rounded border bg-transparent p-2 disabled:opacity-50"
      >
        <option value="">Choose book...</option>
        {books.map((book) => (
          <option key={book.id} value={book.id}>
            {book.title}
          </option>
        ))}
      </select>
      <select
        name="memberId"
        defaultValue=""
        required
        disabled={!canLend}
        className="w-full min-w-0 rounded border bg-transparent p-2 disabled:opacity-50"
      >
        <option value="">Choose member...</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      <button
        disabled={pending || !canLend}
        className="rounded bg-white p-2 font-medium text-black disabled:opacity-50"
      >
        {pending ? "Recording..." : `Lend for ${defaultLoanDays} days`}
      </button>
      {!canLend && (
        <p className="text-sm text-gray-500">
          Add an available book and a member first.
        </p>
      )}
      {state.message && (
        <p className={state.ok ? "text-green-500" : "text-red-500"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
