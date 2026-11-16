"use client";

import { useActionState, type InputHTMLAttributes } from "react";
import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";
import { EmailVerificationForm } from "@/components/verify-email-forms";
import {
  memberLoginAction,
  registerMemberAction,
  requestMemberPasswordChangeAction,
  type MemberFormState,
} from "@/app/member-actions";

const initial: MemberFormState = { message: "" };

function Message({ state }: { state: MemberFormState }) {
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

export function MemberLoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(memberLoginAction, initial);

  return (
    <form action={action} className="grid gap-4">
      {next && <input type="hidden" name="next" value={next} />}
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
            href="/verify-email?type=member"
            className="font-medium text-brand underline-offset-4 hover:text-brand-hover hover:underline"
          >
            Enter or resend verification code
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
        <Link
          href="/member/forgot-password"
          className="text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Forgot password?
        </Link>
        <Link
          href="/member/register"
          className="font-medium text-brand underline-offset-4 hover:text-brand-hover hover:underline"
        >
          Create an account
        </Link>
      </div>
      <p className="border-t border-line pt-4 text-center text-xs text-muted">
        Library staff?{" "}
        <Link
          href="/login"
          className="font-medium text-muted-strong underline-offset-4 hover:text-foreground hover:underline"
        >
          Sign in to the staff workspace
        </Link>
      </p>
    </form>
  );
}

export function MemberRegisterForm() {
  const [state, action, pending] = useActionState(
    registerMemberAction,
    initial
  );

  if (state.ok && state.verificationEmail) {
    return (
      <div className="grid gap-4">
        <Message state={state} />
        <EmailVerificationForm
          initialEmail={state.verificationEmail}
          accountType="member"
        />
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
        Create a portal account with the email address on your library
        membership. If the library already has a record for you, it will be
        linked automatically. We will email a six-digit verification code before
        you can sign in.
      </p>
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
      <Submit pending={pending} label="Create member account" />
      <div className="text-center">
        <Link
          href="/member/login"
          className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Already have an account? Sign in
        </Link>
      </div>
    </form>
  );
}

export function MemberForgotForm() {
  const [state, action, pending] = useActionState(
    requestMemberPasswordChangeAction,
    initial
  );

  return (
    <form action={action} className="grid gap-4">
      <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
        Library staff will set a temporary password for you. Once they confirm
        your identity they can share it with you, and you can choose a new one
        after signing in.
      </p>
      <Field
        label="Email address"
        name="email"
        type="email"
        required
        autoComplete="username"
        maxLength={254}
        autoFocus
      />
      <label className="grid gap-1 text-sm">
        <span className="label">Note for staff (optional)</span>
        <textarea
          name="note"
          rows={3}
          maxLength={300}
          className="field w-full"
          placeholder="For example: I will collect it in person tomorrow."
        />
        <span className="hint">
          Do not include your password. Staff may ask for this note when you
          come in.
        </span>
      </label>
      <Message state={state} />
      <Submit pending={pending} label="Send request to library staff" />
      <div className="text-center">
        <Link
          href="/member/login"
          className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </form>
  );
}

