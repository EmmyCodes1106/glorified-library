"use client";

import { useActionState, type InputHTMLAttributes } from "react";
import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";
import { EmailVerificationForm } from "@/components/verify-email-forms";
import {
  loginAction,
  registerAction,
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
      className={`rounded-lg border p-3 text-sm ${
        state.ok
          ? "border-success/30 bg-success-soft text-success"
          : "border-danger/30 bg-danger-soft text-danger"
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
      <span className="label">{label}</span>
      <input {...props} className="field w-full" />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function Submit({
  pending,
  label,
  icon = "arrow",
}: {
  pending: boolean;
  label: string;
  icon?: "arrow" | "login";
}) {
  return (
    <button disabled={pending} className="btn btn-primary w-full">
      {icon === "login" ? (
        <LogIn size={15} aria-hidden="true" />
      ) : (
        <ArrowRight size={15} aria-hidden="true" />
      )}
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
          className="rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success"
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
      <Submit pending={pending} label="Sign in" icon="login" />
      {state.verifyEmail && (
        <p className="text-center text-sm text-muted">
          <Link
            href="/verify-email?type=staff"
            className="font-medium text-brand underline-offset-4 hover:text-brand-hover hover:underline"
          >
            Enter or resend verification code
          </Link>
        </p>
      )}
      <div className="text-center">
        <Link
          href="/forgot-password"
          className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Forgot password?
        </Link>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initial);

  if (state.ok && state.verificationEmail) {
    return (
      <div className="grid gap-4">
        <Message state={state} />
        <EmailVerificationForm
          initialEmail={state.verificationEmail}
          accountType="staff"
        />
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <Field
        label="Full name"
        name="name"
        required
        autoComplete="name"
        maxLength={160}
        autoFocus
      />
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
      <Message state={state} />
      <Submit pending={pending} label="Request staff access" />
      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Already have an account? Sign in
        </Link>
      </div>
    </form>
  );
}

export function SetupForm({ tokenConfigured }: { tokenConfigured: boolean }) {  const [state, action, pending] = useActionState(setupAction, initial);

  return (
    <form action={action} className="grid gap-4">
      <p className="text-sm text-muted">
        Create the first Super Administrator account. This form is only
        available while the library has no staff accounts.
      </p>
      <Field
        label="Full name"
        name="name"
        required
        autoComplete="name"
        maxLength={160}
      />
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
        <p className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning">
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
      <Submit pending={pending} label="Send reset link" />
      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
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
      <Submit pending={pending} label="Set new password" />
      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
