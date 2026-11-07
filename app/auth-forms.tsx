"use client";

import { useActionState, type InputHTMLAttributes } from "react";
import Link from "next/link";
import {
  loginAction,
  requestPasswordReset,
  resetPasswordAction,
  setupAction,
  type AuthFormState,
} from "./auth-actions";

const initial: AuthFormState = { message: "" };

function Message({ state }: { state: AuthFormState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded border p-3 text-sm ${
        state.ok
          ? "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
          : "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      }`}
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

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      disabled={pending}
      className="rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
    >
      {pending ? "Please wait..." : label}
    </button>
  );
}

export function LoginForm({ reset, next }: { reset: boolean; next?: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="grid gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      {reset && (
        <p
          role="status"
          className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
        >
          Password updated. Sign in with your new password.
        </p>
      )}
      <Field
        label="Email address"
        name="email"
        type="email"
        required
        autoComplete="username"
        autoFocus
        maxLength={254}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        maxLength={200}
      />
      <Message state={state} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Submit pending={pending} label="Sign in" />
        <Link
          href="/forgot-password"
          className="text-sm underline underline-offset-4"
        >
          Forgot password?
        </Link>
      </div>
    </form>
  );
}

export function SetupForm({ tokenConfigured }: { tokenConfigured: boolean }) {
  const [state, action, pending] = useActionState(setupAction, initial);

  return (
    <form action={action} className="grid gap-4">
      <p className="text-sm text-gray-500">
        Create the first Super Administrator account. This form is only
        available while the library has no staff accounts.
      </p>
      <Field label="Full name" name="name" required autoComplete="name" maxLength={160} />
      <Field
        label="Email address"
        name="email"
        type="email"
        required
        autoComplete="username"
        maxLength={254}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        maxLength={200}
        hint="At least 12 characters, including a letter and a number."
      />
      <Field
        label="Confirm password"
        name="confirmPassword"
        type="password"
        required
        autoComplete="new-password"
        maxLength={200}
      />
      <Field
        label="Setup token"
        name="setupToken"
        type="password"
        required
        autoComplete="off"
        hint="The value of AUTH_SETUP_TOKEN set on the server."
      />
      {!tokenConfigured && (
        <p className="rounded border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">
          AUTH_SETUP_TOKEN is not configured on the server. Add it to the
          environment, restart the app, then reload this page.
        </p>
      )}
      <Message state={state} />
      <Submit pending={pending} label="Create super administrator" />
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    initial
  );

  return (
    <form action={action} className="grid gap-4">
      <Field
        label="Email address"
        name="email"
        type="email"
        required
        autoComplete="username"
        maxLength={254}
        autoFocus
      />
      <Message state={state} />
      <div className="flex flex-wrap items-center gap-4">
        <Submit pending={pending} label="Send reset link" />
        <Link href="/login" className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    resetPasswordAction,
    initial
  );

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <Field
        label="New password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        maxLength={200}
        autoFocus
        hint="At least 12 characters, including a letter and a number."
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        required
        autoComplete="new-password"
        maxLength={200}
      />
      <Message state={state} />
      <div className="flex flex-wrap items-center gap-4">
        <Submit pending={pending} label="Set new password" />
        <Link href="/login" className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
