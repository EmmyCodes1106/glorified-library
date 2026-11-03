"use client";

import { useState, useActionState } from "react";
import { updateBook, deleteBook, type FormState } from "./actions";

type Props = { id: number; title: string; author: string; year: number | null };

const initial: FormState = { message: "" };

export default function BookActions({ id, title, author, year }: Props) {
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

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
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
      {deleteState.message && !deleteState.ok && (
        <span className="text-red-500">{deleteState.message}</span>
      )}
    </div>
  );
}