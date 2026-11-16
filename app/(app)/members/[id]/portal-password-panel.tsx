"use client";

import { useActionState, useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import {
  dismissMemberPasswordRequestAction,
  setMemberPortalPasswordAction,
  type PortalPasswordState,
} from "./actions";

const initial: PortalPasswordState = { message: "" };

function Message({ state }: { state: PortalPasswordState }) {
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

export default function PortalPasswordPanel({
  memberId,
  memberName,
  hasPassword,
  emailVerified,
  request,
}: {
  memberId: number;
  memberName: string;
  hasPassword: boolean;
  emailVerified: boolean;
  request: { requested: string; note: string | null } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [setState, setAction, setting] = useActionState(
    async (prev: PortalPasswordState, formData: FormData) => {
      const result = await setMemberPortalPasswordAction(prev, formData);
      if (result.ok) setEditing(false);
      return result;
    },
    initial
  );
  const [dismissState, dismissAction, dismissing] = useActionState(
    dismissMemberPasswordRequestAction,
    initial
  );

  return (
    <section className="card p-5" aria-labelledby="portal-password-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="portal-password-heading" className="font-semibold">
            Portal password
          </h2>
          <p className="mt-1 text-sm text-muted">
            Set a temporary password the member can change after signing in.
          </p>
        </div>
        <span
          className={`badge shrink-0 ${
            hasPassword ? "badge-success" : "badge-neutral"
          }`}
        >
          {hasPassword ? "Set" : "Not set"}
        </span>
      </div>

      {request && (
        <div className="mt-4 rounded-lg border border-warning/25 bg-warning-soft p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <ShieldAlert size={14} aria-hidden="true" />
            Password change requested
          </p>
          <p className="mt-1 text-xs text-warning">
            {request.requested}
          </p>
          {request.note && (
            <p className="mt-2 whitespace-pre-line break-words rounded-md bg-surface/60 p-2 text-xs text-warning">
              “{request.note}”
            </p>
          )}
          <form action={dismissAction} className="mt-2">
            <input type="hidden" name="memberId" value={memberId} />
            <button
              disabled={dismissing}
              className="btn btn-sm btn-ghost justify-self-start"
            >
              {dismissing ? "Dismissing..." : "Dismiss request"}
            </button>
          </form>
        </div>
      )}

      {!emailVerified && (
        <p className="mt-4 rounded-lg border border-warning/25 bg-warning-soft p-3 text-xs text-warning">
          This member has not confirmed their email address yet, so they cannot
          sign in even with a temporary password.
        </p>
      )}

      {!editing ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn btn-sm btn-secondary"
          >
            <KeyRound size={14} aria-hidden="true" />
            {hasPassword ? "Reset portal password" : "Set portal password"}
          </button>
        </div>
      ) : (
        <form action={setAction} className="mt-4 grid gap-3 border-t border-line pt-4">
          <input type="hidden" name="memberId" value={memberId} />
          <p className="text-sm text-muted">
            Set a temporary password for {memberName}. Share it privately; all
            open portal sessions will be signed out.
          </p>
          <label className="grid gap-1 text-sm">
            <span className="label">Temporary password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              maxLength={200}
              className="field w-full"
            />
            <span className="hint">
              At least 12 characters, including a letter and a number.
            </span>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="label">Confirm password</span>
            <input
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              maxLength={200}
              className="field w-full"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={setting} className="btn btn-primary">
              {setting ? "Saving..." : "Set temporary password"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2 empty:mt-0">
        <Message state={setState} />
        <Message state={dismissState} />
      </div>
    </section>
  );
}
