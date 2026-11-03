"use client";

import { useActionState } from "react";
import { addBook, type FormState } from "./actions";

const initial: FormState = { message: "" };

export default function AddBookForm() {
  const [state, action, pending] = useActionState(addBook, initial);

  return (
    <form action={action} className="mb-6 grid gap-3 rounded border p-4">
      <h2 className="font-medium">Add a book</h2>
      <input name="title" placeholder="Title" className="rounded border bg-transparent p-2" />
      <input name="author" placeholder="Author" className="rounded border bg-transparent p-2" />
      <input name="year" placeholder="Year" inputMode="numeric" className="rounded border bg-transparent p-2" />
      <button
        disabled={pending}
        className="rounded bg-white p-2 font-medium text-black disabled:opacity-50"
      >
        {pending ? "Adding..." : "Add book"}
      </button>
      {state.message && (
        <p className={state.ok ? "text-green-500" : "text-red-500"}>
          {state.message}
        </p>
      )}
    </form>
  );
}