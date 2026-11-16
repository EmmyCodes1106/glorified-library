"use client";

import { useState, useActionState } from "react";
import { BookUp } from "lucide-react";
import { lendBook, type FormState } from "@/app/actions";
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
  today: string;
  defaultDueDate: string;
};

function daysBetween(today: string, dueDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return Number.NaN;
  }
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${dueDate}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export default function CheckoutForm({
  members,
  books,
  defaultLoanDays,
  today,
  defaultDueDate,
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
    const dueDate = String(data.get("dueDate") ?? "");

    if (!memberId || !bookId) {
      event.preventDefault();
      setClientError("Choose a member and an available book before issuing.");
      return;
    }
    const loanDays = daysBetween(today, dueDate);
    if (!Number.isFinite(loanDays) || loanDays < 1 || loanDays > 365) {
      event.preventDefault();
      setClientError("Choose a due date between 1 and 365 days from today.");
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
      className="card grid gap-4 p-5"
    >
      <div>
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand"
            aria-hidden="true"
          >
            <BookUp size={16} strokeWidth={2.5} />
          </span>
          <h2 className="font-semibold tracking-tight">Issue a book</h2>
        </div>
        <p className="mt-2 text-sm text-muted">
          Search by name, member ID, book title or book ID. The due date is
          filled in automatically from the library&apos;s loan period and can be
          changed for any loan.
        </p>
      </div>

      <div
        key={`${version}-${defaultDueDate}`}
        className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]"
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
        <label className="grid gap-1">
          <span className="label">Due date</span>
          <input
            type="date"
            name="dueDate"
            required
            min={today}
            disabled={!canLend}
            defaultValue={defaultDueDate}
            className="field w-full"
          />
          <span className="hint">
            Pre-filled with {defaultLoanDays} days. Change it to set a custom
            return date.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending || !canLend}
          className="btn btn-primary"
        >
          {pending ? "Issuing..." : "Issue book"}
        </button>
        <p className="text-xs text-muted">
          {members.length} active {members.length === 1 ? "member" : "members"} ·{" "}
          {books.length} {books.length === 1 ? "title" : "titles"} with copies
          available
        </p>
      </div>

      {!canLend && (
        <p className="text-sm text-muted">
          {members.length === 0
            ? "There are no active members. Register or reactivate a membership first."
            : "Every copy is currently on loan. Record a return before issuing."}
        </p>
      )}

      {(clientError || state.message) && (
        <p
          role={clientError || !state.ok ? "alert" : "status"}
          className={`text-sm ${
            clientError || !state.ok ? "text-danger" : "text-success"
          }`}
        >
          {clientError || state.message}
        </p>
      )}
    </form>
  );
}
