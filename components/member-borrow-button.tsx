"use client";

import { useActionState } from "react";
import { BookPlus } from "lucide-react";
import { borrowBook, type MemberFormState } from "@/app/member-actions";

const initial: MemberFormState = { message: "" };

export default function MemberBorrowButton({
  bookId,
  days,
}: {
  bookId: number;
  days: number;
}) {
  const [state, action, pending] = useActionState(borrowBook, initial);

  return (
    <div className="flex flex-col gap-1.5">
      <form action={action}>
        <input type="hidden" name="bookId" value={bookId} />
        <button disabled={pending} className="btn btn-sm btn-primary w-full">
          <BookPlus size={14} aria-hidden="true" />
          {pending ? "Borrowing..." : `Borrow for ${days} days`}
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
