"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { addBook, type FormState } from "@/app/actions";
import { BookBasicFields, BookDetailFields } from "./book-form-fields";
import BookLookup from "./book-lookup";

const initial: FormState = { message: "" };

export default function AddBookForm() {
  const [state, action, pending] = useActionState(addBook, initial);

  return (
    <form action={action} className="card p-5">
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand"
          aria-hidden="true"
        >
          <Plus size={16} strokeWidth={2.5} />
        </span>
        <h2 className="font-semibold tracking-tight">Add a book</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        Only the first three fields are required. New categories and genres are
        created automatically.
      </p>

      <div className="mt-4">
        <BookLookup />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <BookBasicFields />
      </div>

      <details className="group mt-4 rounded-lg border border-dashed border-line-strong bg-surface-2/50 p-3">
        <summary className="cursor-pointer select-none text-sm font-medium">
          More inventory details
        </summary>
        <p className="mt-1 text-xs text-muted">
          Optional: ISBN, category, genres, copies, location, description and
          cover.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <BookDetailFields />
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn btn-primary">
          {pending ? "Adding..." : "Add book"}
        </button>
        {state.message && (
          <p
            role={state.ok ? "status" : "alert"}
            className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
