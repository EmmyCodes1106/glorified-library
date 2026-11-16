"use client";

import { useState, useActionState } from "react";
import {
  updateBook,
  deleteBook,
  lendBook,
  returnBook,
  type FormState,
} from "@/app/actions";
import BookFormFields, { type BookFormValues } from "./book-form-fields";
import ConfirmDialog, { DialogSubmit } from "./confirm-dialog";

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleUpdate(prev: FormState, formData: FormData) {
    const result = await updateBook(prev, formData);
    if (result.ok) setEditing(false);
    return result;
  }

  const [updateState, updateAction, updating] = useActionState(
    handleUpdate,
    initial
  );
  const [deleteState, deleteAction] = useActionState(deleteBook, initial);
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
        className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2"
      >
        <input type="hidden" name="id" value={book.id} />
        <BookFormFields book={book} removeCover />
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button
            disabled={updating}
            className="btn btn-primary"
          >
            {updating ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
        {updateState.message && !updateState.ok && (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {updateState.message}
          </p>
        )}
      </form>
    );
  }

  const feedback = [lendState, returnState, deleteState].filter(
    (state) => state.message
  );

  return (
    <div className="mt-4 grid gap-3 text-sm">
      {canCirculate && loans.length > 0 && (
        <div className="rounded-lg border border-warning/25 bg-warning-soft p-3">
          <p className="font-medium text-warning">
            {loans.length} of {book.totalCopies}{" "}
            {book.totalCopies === 1 ? "copy" : "copies"} on loan
          </p>
          <ul className="mt-2 grid gap-2">
            {loans.map((loan) => (
              <li
                key={loan.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="min-w-0 text-muted-strong">
                  {loan.member} · due {loan.due}
                </span>
                <form action={returnAction}>
                  <input type="hidden" name="loanId" value={loan.id} />
                  <button
                    disabled={returning}
                    className="btn btn-sm btn-secondary"
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
                aria-label="Member borrowing this book"
                defaultValue=""
                required
                className="field w-full sm:w-auto"
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
                className="btn btn-sm btn-secondary"
              >
                {lending ? "Lending..." : "Lend copy"}
              </button>
            </form>
          ) : (
            <span className="badge badge-warning">All copies on loan</span>
          ))}

        {canManage && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="btn btn-sm btn-secondary"
            >
              Edit
            </button>

            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="btn btn-sm btn-danger"
            >
              Delete
            </button>

            {confirmingDelete && (
              <ConfirmDialog
                title={`Delete "${book.title}"?`}
                description={`This removes the title and all ${book.totalCopies} ${
                  book.totalCopies === 1 ? "copy" : "copies"
                } from the catalogue. This cannot be undone.`}
                onClose={() => setConfirmingDelete(false)}
              >
                <form action={deleteAction} className="contents">
                  <input type="hidden" name="id" value={book.id} />
                  <DialogSubmit pendingLabel="Deleting...">
                    Delete book
                  </DialogSubmit>
                </form>
              </ConfirmDialog>
            )}
          </>
        )}
      </div>

      {feedback.map((state, index) => (
        <p
          key={index}
          role={state.ok ? "status" : "alert"}
          className={state.ok ? "text-success" : "text-danger"}
        >
          {state.message}
        </p>
      ))}
    </div>
  );
}
