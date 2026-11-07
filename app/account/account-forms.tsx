"use client";

import { useActionState, type InputHTMLAttributes } from "react";
import {
  changePasswordAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  updateAccountAction,
  type AuthFormState,
} from "../auth-actions";

const initial: AuthFormState = { message: "" };

function Message({ state }: { state: AuthFormState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`text-sm ${state.ok ? "text-green-600" : "text-red-500"}`}
    >
      {state.message}
    </p>
  );
}

function Field({
  label,
  hint,
  ...props
}: {
  label: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <input
        {...props}
        className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
      />
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export function AccountDetailsForm({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(updateAccountAction, initial);

  return (
    <form action={action} className="grid gap-3">
      <Field
        label="Full name"
        name="name"
        required
        maxLength={160}
        autoComplete="name"
        defaultValue={name}
      />
      <Field
        label="Email address"
        name="email"
        type="email"
        required
        maxLength={254}
        autoComplete="email"
        defaultValue={email}
      />
      <Field
        label="Current password (only needed to change your email)"
        name="currentPassword"
        type="password"
        maxLength={200}
        autoComplete="current-password"
      />
      <Message state={state} />
      <button
        disabled={pending}
        className="justify-self-start rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save details"}
      </button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);

  return (
    <form action={action} className="grid gap-3">
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        required
        maxLength={200}
        autoComplete="current-password"
      />
      <Field
        label="New password"
        name="password"
        type="password"
        required
        maxLength={200}
        autoComplete="new-password"
        hint="At least 12 characters, including a letter and a number."
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        required
        maxLength={200}
        autoComplete="new-password"
      />
      <Message state={state} />
      <button
        disabled={pending}
        className="justify-self-start rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
      >
        {pending ? "Updating..." : "Change password"}
      </button>
    </form>
  );
}

export function RevokeOtherSessionsButton() {
  const [state, action, pending] = useActionState(
    revokeOtherSessionsAction,
    initial
  );

  return (
    <form action={action} className="grid gap-2">
      <button
        disabled={pending}
        className="justify-self-start rounded border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {pending ? "Signing out..." : "Sign out other sessions"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function SessionRevokeButton({ sessionId }: { sessionId: number }) {
  const [state, action, pending] = useActionState(revokeSessionAction, initial);

  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <button
        disabled={pending}
        className="text-sm text-red-500 underline disabled:opacity-50"
      >
        {pending ? "Signing out..." : "Sign out"}
      </button>
      <Message state={state} />
    </form>
  );
}
