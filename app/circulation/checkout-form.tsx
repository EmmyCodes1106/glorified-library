"use client";

import { useState, useActionState } from "react";
import { lendBook, type FormState } from "../actions";
import SearchSelect from "./search-select";

const initial: FormState = { message: "" };

type MemberChoice = {
  id: number;
  code: string;
  name: string;
  openLoans: number;
  loanLimit: number;
};

type BookChoice = {
  id: number;
  code: string;
  title: string;
  author: string;
  available: number;
};

type Props = {
  members: MemberChoice[];
  books: BookChoice[];
  defaultLoanDays: number;
};

export default function CheckoutForm({
  members,
  books,
  defaultLoanDays,
}: Props) {
  const [version, setVersion] = useState(0);
  const [clientError, setClientError] = useState("");

  async function handleLend(prev: FormState, formData: FormData) {
    const result = await lendBook(prev, formData);
    if (result.ok) {
      setVersion((current) => current + 1);
      setClientError("");
    }
    return result;
  }

  const [state, action, pending] = useActionState(handleLend, initial);
  const canLend = members.length > 0 && books.length > 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const memberId = Number(data.get("memberId"));
    const bookId = Number(data.get("bookId"));
    const days = Number(data.get("days"));

    if (!memberId || !bookId) {
      event.preventDefault();
      setClientError("Choose a member and an available book before issuing.");
      return;
    }
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      event.preventDefault();
      setClientError("Borrowing period must be between 1 and 365 days.");
      return;
    }
    setClientError("");
  }

  const memberOptions = members.map((member) => ({
    id: member.id,
    label: member.name,
    hint: `${member.code} · ${member.openLoans}/${member.loanLimit} on loan${
      member.openLoans >= member.loanLimit ? " · limit reached" : ""
    }`,
  }));

  const bookOptions = books.map((book) => ({
    id: book.id,
    label: book.title,
    hint: `${book.code} · ${book.author} · ${book.available} available`,
  }));

  return (
    <form
      action={action}
      onSubmit={handleSubmit}
      className="grid gap-4 rounded-lg border p-4 sm:p-5"
    >
      <div>
        <h2 className="font-semibold">Issue a book</h2>
        <p className="mt-1 text-sm text-gray-500">
          Search by name, member ID, book title or book ID. Availability,
          membership status and borrowing limits are checked before the loan is
          recorded.
        </p>
      </div>

      <div
        key={`${version}-${defaultLoanDays}`}
        className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.6fr)]"
      >
        <SearchSelect
          name="memberId"
          label="Member"
          placeholder="Search members..."
          options={memberOptions}
          disabled={!canLend}
          emptyMessage="No active members match."
        />
        <SearchSelect
          name="bookId"
          label="Book"
          placeholder="Search available books..."
          options={bookOptions}
          disabled={!canLend}
          emptyMessage="No available books match."
        />
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Period (days)</span>
          <input
            type="number"
            name="days"
            min={1}
            max={365}
            required
            disabled={!canLend}
            defaultValue={defaultLoanDays}
            className="w-full min-w-0 rounded border bg-transparent p-2 text-sm disabled:opacity-50"
          />
          <span className="text-xs text-gray-500">
            Default is {defaultLoanDays} days.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending || !canLend}
          className="rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
        >
          {pending ? "Issuing..." : "Issue book"}
        </button>
        <p className="text-xs text-gray-500">
          {members.length} active {members.length === 1 ? "member" : "members"} ·{" "}
          {books.length} {books.length === 1 ? "title" : "titles"} with copies
          available
        </p>
      </div>

      {!canLend && (
        <p className="text-sm text-gray-500">
          {members.length === 0
            ? "There are no active members. Register or reactivate a membership first."
            : "Every copy is currently on loan. Record a return before issuing."}
        </p>
      )}

      {(clientError || state.message) && (
        <p
          className={`text-sm ${
            clientError || !state.ok ? "text-red-500" : "text-green-600"
          }`}
        >
          {clientError || state.message}
        </p>
      )}
    </form>
  );
}
