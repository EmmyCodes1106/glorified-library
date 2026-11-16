"use client";

import { useActionState, type InputHTMLAttributes } from "react";
import {
  changePasswordAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  updateAccountAction,
  type AuthFormState,
} from "@/app/auth-actions";

const initial: AuthFormState = { message: "" };

function Message({ state }: { state: AuthFormState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}
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
      <span className="label">{label}</span>
      <input {...props} className="field w-full" />
      {hint && <span className="hint">{hint}</span>}
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
        className="btn btn-primary justify-self-start"
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
        className="btn btn-primary justify-self-start"
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
        className="btn btn-sm btn-secondary justify-self-start"
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
        className="btn btn-sm btn-ghost justify-self-start"
      >
        {pending ? "Signing out..." : "Sign out"}
      </button>
      <Message state={state} />
    </form>
  );
}
