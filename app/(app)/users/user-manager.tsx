"use client";

import {
  useRef,
  useState,
  useActionState,
  type InputHTMLAttributes,
} from "react";
import { Check, KeyRound, MailCheck, ShieldCheck, UserPlus } from "lucide-react";
import {
  createUserAction,
  issueUserResetLinkAction,
  resendUserVerificationAction,
  updateUserAction,
  type AuthFormState,
} from "@/app/auth-actions";
import {
  ASSIGNABLE_PERMISSION_GROUPS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLES,
  type Role,
} from "@/lib/auth/permissions";
import { SectionHeader } from "@/components/ui";

const initial: AuthFormState = { message: "" };

export type ManagedUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  permissions: string[];
  is_active: boolean;
  email_verified: boolean;
  pending: boolean;
  last_login_at: string | null;
  created_at: string;
  active_sessions: number;
};

type Defaults = Record<Role, string[]>;

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

function PermissionPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="label">Assigned permissions</legend>
      <div className="grid gap-3 rounded-lg border border-line bg-surface-2 p-3 sm:grid-cols-2">
        {ASSIGNABLE_PERMISSION_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </p>
            <ul className="mt-1.5 grid gap-1.5">
              {group.permissions.map((permission) => (
                <li key={permission.key}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="permissions"
                      value={permission.key}
                      checked={selected.includes(permission.key)}
                      onChange={(event) => {
                        onChange(
                          event.target.checked
                            ? [...selected, permission.key]
                            : selected.filter((item) => item !== permission.key)
                        );
                      }}
                      className="mt-1"
                    />
                    <span>{permission.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <input type="hidden" name="permissionsProvided" value="1" />
    </fieldset>
  );
}

function CreateUserForm({ defaults }: { defaults: Defaults }) {
  const [state, setState] = useState<AuthFormState>(initial);
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState<Role>("librarian");
  const [selected, setSelected] = useState<string[]>(defaults.librarian);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    try {
      const result = await createUserAction(state, formData);
      setState(result);
      if (result.ok) {
        formRef.current?.reset();
        setRole("librarian");
        setSelected(defaults.librarian);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Full name"
          name="name"
          required
          maxLength={160}
          autoComplete="off"
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="off"
        />
        <label className="grid gap-1 text-sm">
          <span className="label">Role</span>
          <select
            name="role"
            value={role}
            onChange={(event) => {
              const next = event.target.value as Role;
              setRole(next);
              setSelected(
                next === "super_admin" ? [] : defaults[next] ?? []
              );
            }}
            className="field w-full"
          >
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {ROLE_LABELS[item]}
              </option>
            ))}
          </select>
          <span className="hint">{ROLE_DESCRIPTIONS[role]}</span>
        </label>
        <Field
          label="Initial password"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={200}
          autoComplete="new-password"
          hint="At least 12 characters, with a letter and a number."
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          maxLength={200}
          autoComplete="new-password"
        />
      </div>

      {role === "super_admin" ? (
        <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
          The Super Administrator role always has full system access.
        </p>
      ) : (
        <PermissionPicker selected={selected} onChange={setSelected} />
      )}

      <Message state={state} />
      <button
        disabled={pending}
        className="btn btn-primary justify-self-start"
      >
        <UserPlus size={15} aria-hidden="true" />
        {pending ? "Creating..." : "Create staff account"}
      </button>
    </form>
  );
}

function ResetLinkForm({ userId }: { userId: number }) {
  const [state, action, pending] = useActionState(
    issueUserResetLinkAction,
    initial
  );

  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="id" value={userId} />
      <button
        disabled={pending}
        className="btn btn-sm btn-ghost justify-self-start"
      >
        <KeyRound size={14} aria-hidden="true" />
        {pending ? "Creating link..." : "Issue reset link"}
      </button>
      <Message state={state} />
      {state.resetLink && (
        <input
          readOnly
          value={state.resetLink}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="One-time password reset link"
          className="field field-xs w-full"
        />
      )}
    </form>
  );
}

function ResendVerificationForm({ userId }: { userId: number }) {
  const [state, action, pending] = useActionState(
    resendUserVerificationAction,
    initial
  );

  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="id" value={userId} />
      <button
        disabled={pending}
        className="btn btn-sm btn-ghost justify-self-start"
      >
        <MailCheck size={14} aria-hidden="true" />
        {pending ? "Sending..." : "Resend confirmation"}
      </button>
      <Message state={state} />
    </form>
  );
}

function UserRow({
  user,
  currentUserId,
  defaults,
}: {
  user: ManagedUser;
  currentUserId: number;
  defaults: Defaults;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<Role>(user.role);
  const [selected, setSelected] = useState<string[]>(
    user.pending ? defaults[user.role] : user.permissions
  );
  const [state, setState] = useState<AuthFormState>(initial);
  const [pending, setPending] = useState(false);
  const isSelf = user.id === currentUserId;

  async function handleSubmit(formData: FormData) {
    setPending(true);
    try {
      const result = await updateUserAction(state, formData);
      setState(result);
      if (result.ok) setEditing(false);
    } finally {
      setPending(false);
    }
  }

  async function approveNow() {
    if (pending) return;
    const formData = new FormData();
    formData.set("id", String(user.id));
    formData.set("name", user.name);
    formData.set("role", user.role);
    formData.set("approve", "1");
    await handleSubmit(formData);
  }

  return (
    <li
      className={`card p-4 sm:p-5 ${
        user.pending ? "border-warning/40 bg-warning-soft/40" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {user.name}
            {isSelf && <span className="badge badge-success">You</span>}
            {user.pending && (
              <span className="badge badge-warning">Awaiting approval</span>
            )}
            {!user.email_verified && (
              <span className="badge badge-warning">Email unconfirmed</span>
            )}
            {!user.is_active && !user.pending && (
              <span className="badge badge-danger">Deactivated</span>
            )}
          </p>
          <p className="text-sm text-muted">{user.email}</p>
          <p className="mt-1 text-xs text-muted">
            {ROLE_LABELS[user.role]} ·{" "}
            {user.active_sessions === 1
              ? "1 active session"
              : `${user.active_sessions} active sessions`}{" "}
            · last sign-in {user.last_login_at ?? "never"}
          </p>
        </div>
        {!isSelf && (
          <div className="flex flex-wrap items-start gap-2">
            {user.pending && (
              <button
                type="button"
                onClick={approveNow}
                disabled={pending}
                className="btn btn-sm btn-primary"
              >
                <Check size={14} aria-hidden="true" />
                {pending ? "Approving..." : "Approve"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="btn btn-sm btn-secondary"
            >
              {editing
                ? "Close"
                : user.pending
                  ? "Review request"
                  : "Edit account"}
            </button>
            {user.is_active && <ResetLinkForm userId={user.id} />}
            {!user.email_verified && (
              <ResendVerificationForm userId={user.id} />
            )}
          </div>
        )}
        {isSelf && (
          <span className="text-xs text-muted">
            Update your own details on the Account page.
          </span>
        )}
      </div>

      {!editing && (
        <div className="mt-3">
          <Message state={state} />
        </div>
      )}

      {editing && !isSelf && (
        <form
          action={handleSubmit}
          className="mt-4 grid gap-4 border-t border-line pt-4"
        >
          <input type="hidden" name="id" value={user.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Full name"
              name="name"
              required
              maxLength={160}
              defaultValue={user.name}
            />
            <label className="grid gap-1 text-sm">
              <span className="label">Role</span>
              <select
                name="role"
                value={role}
                onChange={(event) => {
                  const next = event.target.value as Role;
                  setRole(next);
                  setSelected(
                    next === "super_admin" ? [] : defaults[next] ?? []
                  );
                }}
                className="field w-full"
              >
                {ROLES.map((item) => (
                  <option key={item} value={item}>
                    {ROLE_LABELS[item]}
                  </option>
                ))}
              </select>
              <span className="hint">{ROLE_DESCRIPTIONS[role]}</span>
            </label>
          </div>

          {user.pending ? (
            <>
              <input type="hidden" name="approve" value="1" />
              <p className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning">
                Approving activates this account immediately with the selected
                role and permissions. The staff member signs in with the
                password they chose
                {user.email_verified
                  ? "."
                  : ", once they have confirmed their email address."}
              </p>
            </>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={user.is_active}
              />
              <span>Account is active</span>
            </label>
          )}

          {role === "super_admin" ? (
            <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
              The Super Administrator role always has full system access.
            </p>
          ) : (
            <PermissionPicker selected={selected} onChange={setSelected} />
          )}

          <Message state={state} />
          <button
            disabled={pending}
            className="btn btn-primary justify-self-start"
          >
            {user.pending
              ? pending
                ? "Approving..."
                : "Approve account"
              : pending
                ? "Saving..."
                : "Save account"}
          </button>
        </form>
      )}
    </li>
  );
}

export default function UserManager({
  users,
  currentUserId,
  defaults,
}: {
  users: ManagedUser[];
  currentUserId: number;
  defaults: Defaults;
}) {
  const pendingCount = users.filter((user) => user.pending).length;
  const unconfirmedCount = users.filter((user) => !user.email_verified).length;

  return (
    <div className="grid gap-6">
      <section className="card p-5" aria-labelledby="new-user-heading">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
            <UserPlus size={16} aria-hidden="true" />
          </span>
          <div>
            <h2 id="new-user-heading" className="font-semibold">
              Add a staff account
            </h2>
            <p className="mt-1 text-sm text-muted">
              Choose a role and, for non-super administrators, the permissions
              the account should have.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <CreateUserForm defaults={defaults} />
        </div>
      </section>

      <section aria-labelledby="staff-heading">
        <SectionHeader
          id="staff-heading"
          title="Staff accounts"
          description="Every account, with role, activity and session details."
          action={
            <div className="flex flex-wrap items-center gap-2">
              {pendingCount > 0 && (
                <span className="badge badge-warning">
                  {pendingCount} awaiting approval
                </span>
              )}
              {unconfirmedCount > 0 && (
                <span className="badge badge-warning">
                  {unconfirmedCount} email unconfirmed
                </span>
              )}
              <span className="badge badge-info">
                <ShieldCheck size={12} aria-hidden="true" />
                {users.length} total
              </span>
            </div>
          }
        />
        {pendingCount > 0 && (
          <p className="mt-4 rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning">
            {pendingCount === 1
              ? "One request is"
              : `${pendingCount} requests are`}{" "}
            waiting for review. Press “Approve” to activate an account with the
            default permissions for its role, or open “Review request” to choose
            the role and permissions first.
          </p>
        )}
        <ul className="mt-4 grid gap-3">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              currentUserId={currentUserId}
              defaults={defaults}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
