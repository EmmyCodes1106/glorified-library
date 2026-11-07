"use client";

import { useActionState } from "react";
import { addBook, type FormState } from "./actions";
import { BookBasicFields, BookDetailFields } from "./book-form-fields";

const initial: FormState = { message: "" };

export default function AddBookForm() {
  const [state, action, pending] = useActionState(addBook, initial);

  return (
    <form action={action} className="mb-6 rounded-lg border p-4 sm:p-5">
      <h2 className="font-semibold">Add a book</h2>
      <p className="mt-1 text-sm text-gray-500">
        Only the first three fields are required. New categories and genres are
        created automatically.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <BookBasicFields />
      </div>

      <details className="mt-4 rounded border border-dashed p-3">
        <summary className="cursor-pointer text-sm font-medium">
          More inventory details
        </summary>
        <p className="mt-1 text-xs text-gray-500">
          Optional: ISBN, category, genres, copies, location, description and
          cover.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <BookDetailFields />
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
        >
          {pending ? "Adding..." : "Add book"}
        </button>
        {state.message && (
          <p
            className={`text-sm ${state.ok ? "text-green-600" : "text-red-500"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
