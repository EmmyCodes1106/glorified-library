import { connection } from "next/server";
import sql from "@/db";
import AppNav from "../app-nav";
import { requireUser } from "@/lib/auth/dal";
import {
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  permissionLabel,
} from "@/lib/auth/permissions";
import { signOutEverywhereAction } from "../auth-actions";
import LibraryBrand from "../library-brand";
import {
  AccountDetailsForm,
  ChangePasswordForm,
  RevokeOtherSessionsButton,
  SessionRevokeButton,
} from "./account-forms";

export const metadata = {
  title: "Your account",
};

// every request needs the session cookie before any data is read
export const instant = false;

type SessionRow = {
  id: number;
  user_agent: string | null;
  ip_address: string | null;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
};

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  const browser =
    /Edg\//.test(userAgent)
      ? "Edge"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";
  const system = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X/.test(userAgent)
      ? "macOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return system ? `${browser} on ${system}` : browser;
}

export default async function AccountPage() {
  await connection();

  const user = await requireUser();
  const [details, sessions] = await Promise.all([
    sql<{
      created_at: Date;
      last_login_at: Date | null;
      password_changed_at: Date;
    }[]>`
      select created_at, last_login_at, password_changed_at
      from users where id = ${user.id}
    `,
    sql<SessionRow[]>`
      select id, user_agent, ip_address, created_at, last_seen_at, expires_at
      from sessions
      where user_id = ${user.id}
        and revoked_at is null
        and expires_at > now()
      order by created_at desc
    `,
  ]);

  const profile = details[0];
  const permissions =
    user.role === "super_admin"
      ? [...PERMISSIONS]
      : user.permissions;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <LibraryBrand />
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Your account</h1>
          <p className="mt-1 text-sm text-gray-500">
            Profile, password, permissions and active sessions.
          </p>
        </div>
        <AppNav current="account" />
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Role</p>
          <p className="mt-1 font-semibold">{ROLE_LABELS[user.role]}</p>
          <p className="mt-1 text-xs text-gray-500">
            {ROLE_DESCRIPTIONS[user.role]}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Last sign-in
          </p>
          <p className="mt-1 font-medium">
            {formatDate(profile?.last_login_at ?? null)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Account created {formatDate(profile?.created_at ?? null)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Password changed
          </p>
          <p className="mt-1 font-medium">
            {formatDate(profile?.password_changed_at ?? null)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Sessions expire automatically after 7 days.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border p-5" aria-labelledby="details-heading">
          <h2 id="details-heading" className="font-semibold">
            Account details
          </h2>
          <div className="mt-4">
            <AccountDetailsForm name={user.name} email={user.email} />
          </div>
        </section>

        <section className="rounded-lg border p-5" aria-labelledby="password-heading">
          <h2 id="password-heading" className="font-semibold">
            Change password
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Changing your password signs out every other session.
          </p>
          <div className="mt-4">
            <ChangePasswordForm />
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-lg border p-5" aria-labelledby="permissions-heading">
        <h2 id="permissions-heading" className="font-semibold">
          Your permissions
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          These determine what you can view and change. Server checks apply even
          if a page is opened directly.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          {permissions.map((permission) => (
            <li
              key={permission}
              className="rounded-full border px-2.5 py-1 text-gray-600 dark:text-gray-300"
            >
              {permissionLabel(permission)}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-lg border p-5" aria-labelledby="sessions-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="sessions-heading" className="font-semibold">
              Active sessions
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Review where your account is signed in and close sessions you no
              longer use.
            </p>
          </div>
          <div className="grid gap-2">
            <RevokeOtherSessionsButton />
            <form action={signOutEverywhereAction}>
              <button className="justify-self-start rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400">
                Sign out everywhere
              </button>
            </form>
          </div>
        </div>

        <ul className="mt-4 grid gap-3">
          {sessions.map((session) => {
            const current = session.id === user.sessionId;
            return (
              <li
                key={session.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {describeDevice(session.user_agent)}
                    {current && (
                      <span className="ml-2 rounded-full border border-green-300 px-2 py-0.5 text-[11px] text-green-700 dark:border-green-800 dark:text-green-400">
                        This session
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    IP {session.ip_address ?? "unknown"} · signed in{" "}
                    {formatDate(session.created_at)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Last active {formatDate(session.last_seen_at)} · expires{" "}
                    {formatDate(session.expires_at)}
                  </p>
                </div>
                {!current && <SessionRevokeButton sessionId={session.id} />}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
