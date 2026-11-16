"use client";

import { useActionState, type InputHTMLAttributes } from "react";
import {
  changeMemberPasswordAction,
  updateMemberProfileAction,
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

export function MemberContactForm({
  name,
  email,
  phone,
  address,
}: {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}) {
  const [state, action, pending] = useActionState(
    updateMemberProfileAction,
    initial
  );

  return (
    <form action={action} className="grid gap-4">
      <Field label="Full name" name="name" defaultValue={name} required maxLength={160} />
      <Field
        label="Email address"
        type="email"
        defaultValue={email ?? ""}
        readOnly
        hint="This is your sign-in address. Contact the library to change it."
      />
      <Field
        label="Phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        defaultValue={phone ?? ""}
        maxLength={40}
      />
      <label className="grid gap-1 text-sm">
        <span className="label">Address</span>
        <textarea
          name="address"
          defaultValue={address ?? ""}
          maxLength={500}
          rows={3}
          className="field w-full"
        />
      </label>
      <Message state={state} />
      <div>
        <button disabled={pending} className="btn btn-primary">
          {pending ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}

export function MemberPasswordForm() {
  const [state, action, pending] = useActionState(
    changeMemberPasswordAction,
    initial
  );

  return (
    <form action={action} className="grid gap-4">
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        required
        autoComplete="current-password"
        maxLength={200}
      />
      <Field
        label="New password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        maxLength={200}
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
      <div>
        <button disabled={pending} className="btn btn-primary">
          {pending ? "Saving..." : "Change password"}
        </button>
      </div>
    </form>
  );
}
