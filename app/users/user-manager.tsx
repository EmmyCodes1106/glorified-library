"use client";

import {
  useRef,
  useState,
  useActionState,
  type InputHTMLAttributes,
} from "react";
import {
  createUserAction,
  issueUserResetLinkAction,
  updateUserAction,
  type AuthFormState,
} from "../auth-actions";
import {
  ASSIGNABLE_PERMISSION_GROUPS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLES,
  type Role,
} from "@/lib/auth/permissions";

const initial: AuthFormState = { message: "" };

export type ManagedUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  permissions: string[];
  is_active: boolean;
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

function PermissionPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm text-gray-500">Assigned permissions</legend>
      <div className="grid gap-3 rounded border p-3 sm:grid-cols-2">
        {ASSIGNABLE_PERMISSION_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {group.label}
            </p>
            <ul className="mt-1 grid gap-1">
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
    <form ref={formRef} action={handleSubmit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
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
          <span className="text-gray-500">Role</span>
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
            className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
          >
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {ROLE_LABELS[item]}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">{ROLE_DESCRIPTIONS[role]}</span>
        </label>
        <Field
          label="Initial password"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={200}
          autoComplete="new-password"
          hint="At least 12 characters, with a letter and a number. Share it securely."
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
        <p className="rounded border p-3 text-sm text-gray-500">
          The Super Administrator role always has full system access.
        </p>
      ) : (
        <PermissionPicker selected={selected} onChange={setSelected} />
      )}

      <Message state={state} />
      <button
        disabled={pending}
        className="justify-self-start rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
      >
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
        className="justify-self-start text-sm underline underline-offset-4 disabled:opacity-50"
      >
        {pending ? "Creating link..." : "Issue reset link"}
      </button>
      <Message state={state} />
      {state.resetLink && (
        <input
          readOnly
          value={state.resetLink}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="One-time password reset link"
          className="w-full min-w-0 rounded border bg-transparent p-2 text-xs"
        />
      )}
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
  const [selected, setSelected] = useState<string[]>(user.permissions);
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

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {user.name}
            {isSelf && (
              <span className="ml-2 rounded-full border border-green-300 px-2 py-0.5 text-[11px] text-green-700 dark:border-green-800 dark:text-green-400">
                You
              </span>
            )}
            {!user.is_active && (
              <span className="ml-2 rounded-full border border-red-300 px-2 py-0.5 text-[11px] text-red-600 dark:border-red-900 dark:text-red-400">
                Deactivated
              </span>
            )}
          </p>
          <p className="text-sm text-gray-500">{user.email}</p>
          <p className="mt-1 text-xs text-gray-500">
            {ROLE_LABELS[user.role]} ·{" "}
            {user.active_sessions === 1
              ? "1 active session"
              : `${user.active_sessions} active sessions`}{" "}
            · last sign-in {user.last_login_at ?? "never"}
          </p>
        </div>
        {!isSelf && (
          <div className="flex flex-wrap items-start gap-4">
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="rounded border px-3 py-1.5 text-sm"
            >
              {editing ? "Close" : "Edit account"}
            </button>
            <ResetLinkForm userId={user.id} />
          </div>
        )}
        {isSelf && (
          <span className="text-xs text-gray-500">
            Update your own details on the Account page.
          </span>
        )}
      </div>

      {editing && !isSelf && (
        <form action={handleSubmit} className="mt-4 grid gap-3 border-t pt-4">
          <input type="hidden" name="id" value={user.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Full name"
              name="name"
              required
              maxLength={160}
              defaultValue={user.name}
            />
            <label className="grid gap-1 text-sm">
              <span className="text-gray-500">Role</span>
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
                className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
              >
                {ROLES.map((item) => (
                  <option key={item} value={item}>
                    {ROLE_LABELS[item]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-500">
                {ROLE_DESCRIPTIONS[role]}
              </span>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={user.is_active}
            />
            <span>Account is active</span>
          </label>

          {role === "super_admin" ? (
            <p className="rounded border p-3 text-sm text-gray-500">
              The Super Administrator role always has full system access.
            </p>
          ) : (
            <PermissionPicker selected={selected} onChange={setSelected} />
          )}

          <Message state={state} />
          <button
            disabled={pending}
            className="justify-self-start rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save account"}
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
  return (
    <div className="grid gap-6">
      <section className="rounded-lg border p-5" aria-labelledby="new-user-heading">
        <h2 id="new-user-heading" className="font-semibold">
          Add a staff account
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose a role and, for non-super administrators, the permissions the
          account should have.
        </p>
        <div className="mt-4">
          <CreateUserForm defaults={defaults} />
        </div>
      </section>

      <section aria-labelledby="staff-heading">
        <h2 id="staff-heading" className="text-lg font-semibold">
          Staff accounts
        </h2>
        <ul className="mt-3 grid gap-3">
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
