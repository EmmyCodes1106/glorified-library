"use client";

import { useActionState } from "react";
import { addMember, type FormState } from "../actions";

const initial: FormState = { message: "" };

export default function AddMemberForm() {
  const [state, action, pending] = useActionState(addMember, initial);

  return (
    <form action={action} className="mb-6 grid gap-3 rounded border p-4">
      <h2 className="font-medium">Add a member</h2>
      <input name="name" placeholder="Name" className="rounded border bg-transparent p-2" />
      <input name="phone" placeholder="Phone (optional)" inputMode="tel" className="rounded border bg-transparent p-2" />
      <button
        disabled={pending}
        className="rounded bg-white p-2 font-medium text-black disabled:opacity-50"
      >
        {pending ? "Adding..." : "Add member"}
      </button>
      {state.message && (
        <p className={state.ok ? "text-green-500" : "text-red-500"}>
          {state.message}
        </p>
      )}
    </form>
  );
}