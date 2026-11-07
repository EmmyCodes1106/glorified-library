"use client";

import { useState, useActionState } from "react";
import {
  updateBook,
  deleteBook,
  lendBook,
  returnBook,
  type FormState,
} from "./actions";
import BookFormFields, { type BookFormValues } from "./book-form-fields";

type ActiveLoan = {
  id: number;
  member: string;
  due: string;
};

type Props = {
  book: BookFormValues & { id: number };
  available: number;
  members: { id: number; name: string }[];
  loans: ActiveLoan[];
  canManage: boolean;
  canCirculate: boolean;
};

const initial: FormState = { message: "" };

export default function BookActions({
  book,
  available,
  members,
  loans,
  canManage,
  canCirculate,
}: Props) {
  const [editing, setEditing] = useState(false);

  async function handleUpdate(prev: FormState, formData: FormData) {
    const result = await updateBook(prev, formData);
    if (result.ok) setEditing(false);
    return result;
  }

  const [updateState, updateAction, updating] = useActionState(
    handleUpdate,
    initial
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteBook,
    initial
  );
  const [lendState, lendAction, lending] = useActionState(lendBook, initial);
  const [returnState, returnAction, returning] = useActionState(
    returnBook,
    initial
  );

  if (!canManage && !canCirculate) return null;

  if (editing && canManage) {
    return (
      <form
        action={updateAction}
        className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2"
      >
        <input type="hidden" name="id" value={book.id} />
        <BookFormFields book={book} removeCover />
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button
            disabled={updating}
            className="rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
          >
            {updating ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="underline"
          >
            Cancel
          </button>
        </div>
        {updateState.message && !updateState.ok && (
          <p className="text-sm text-red-500 sm:col-span-2">
            {updateState.message}
          </p>
        )}
      </form>
    );
  }

  const errors = [lendState, returnState, deleteState].filter(
    (state) => state.message && !state.ok
  );

  return (
    <div className="mt-4 grid gap-3 text-sm">
      {canCirculate && loans.length > 0 && (
        <div className="rounded border border-orange-200 bg-orange-50/40 p-3 dark:border-orange-900 dark:bg-orange-950/20">
          <p className="font-medium text-orange-700 dark:text-orange-400">
            {loans.length} of {book.totalCopies}{" "}
            {book.totalCopies === 1 ? "copy" : "copies"} on loan
          </p>
          <ul className="mt-2 grid gap-2">
            {loans.map((loan) => (
              <li
                key={loan.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="min-w-0 text-gray-600 dark:text-gray-300">
                  {loan.member} · due {loan.due}
                </span>
                <form action={returnAction}>
                  <input type="hidden" name="loanId" value={loan.id} />
                  <button
                    disabled={returning}
                    className="rounded border px-3 py-1 disabled:opacity-50"
                  >
                    {returning ? "Returning..." : "Record return"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canCirculate &&
          (available > 0 ? (
            <form action={lendAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="bookId" value={book.id} />
              <select
                name="memberId"
                defaultValue=""
                required
                className="w-full min-w-0 rounded border bg-transparent p-1 sm:w-auto"
              >
                <option value="">Choose member...</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <button
                disabled={lending}
                className="rounded border px-3 py-1 disabled:opacity-50"
              >
                {lending ? "Lending..." : "Lend copy"}
              </button>
            </form>
          ) : (
            <span className="text-sm text-orange-600 dark:text-orange-400">
              All copies are on loan.
            </span>
          ))}

        {canManage && (
          <>
            <button onClick={() => setEditing(true)} className="underline">
              Edit
            </button>

            <form
              action={deleteAction}
              onSubmit={(event) => {
                if (
                  !confirm(
                    `Delete "${book.title}" and all ${book.totalCopies} ${
                      book.totalCopies === 1 ? "copy" : "copies"
                    }?`
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="id" value={book.id} />
              <button disabled={deleting} className="text-red-500 underline">
                Delete
              </button>
            </form>
          </>
        )}
      </div>

      {errors.map((state, index) => (
        <p key={index} className="text-red-500">
          {state.message}
        </p>
      ))}
    </div>
  );
}
