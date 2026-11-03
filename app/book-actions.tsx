"use client";

import { useState, useActionState } from "react";
import {
  updateBook,
  deleteBook,
  lendBook,
  returnBook,
  type FormState,
} from "./actions";

type Props = {
  id: number;
  title: string;
  author: string;
  year: number | null;
  onLoan: boolean;
  members: { id: number; name: string }[];
};

const initial: FormState = { message: "" };

export default function BookActions({
  id,
  title,
  author,
  year,
  onLoan,
  members,
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

  if (editing) {
    return (
      <form action={updateAction} className="mt-3 grid gap-2">
        <input type="hidden" name="id" value={id} />
        <input name="title" defaultValue={title} className="rounded border bg-transparent p-2" />
        <input name="author" defaultValue={author} className="rounded border bg-transparent p-2" />
        <input name="year" defaultValue={year ?? ""} inputMode="numeric" className="rounded border bg-transparent p-2" />
        <div className="flex gap-3">
          <button disabled={updating} className="rounded bg-white px-3 py-1 font-medium text-black disabled:opacity-50">
            {updating ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="underline">
            Cancel
          </button>
        </div>
        {updateState.message && !updateState.ok && (
          <p className="text-red-500">{updateState.message}</p>
        )}
      </form>
    );
  }

  const errors = [lendState, returnState, deleteState].filter(
    (s) => s.message && !s.ok
  );

  return (
    <div className="mt-3 grid gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {onLoan ? (
          <form action={returnAction}>
            <input type="hidden" name="bookId" value={id} />
            <button disabled={returning} className="rounded border px-3 py-1 disabled:opacity-50">
              {returning ? "Returning..." : "Record return"}
            </button>
          </form>
        ) : (
          <form action={lendAction} className="flex items-center gap-2">
            <input type="hidden" name="bookId" value={id} />
            <select name="memberId" defaultValue="" className="rounded border bg-black p-1">
              <option value="">Choose member...</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button disabled={lending} className="rounded border px-3 py-1 disabled:opacity-50">
              {lending ? "Lending..." : "Lend (14 days)"}
            </button>
          </form>
        )}

        <button onClick={() => setEditing(true)} className="underline">
          Edit
        </button>

        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm(`Delete "${title}"?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button disabled={deleting} className="text-red-500 underline">
            Delete
          </button>
        </form>
      </div>

      {errors.map((s, i) => (
        <p key={i} className="text-red-500">
          {s.message}
        </p>
      ))}
    </div>
  );
}