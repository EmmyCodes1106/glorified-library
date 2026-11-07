import { connection } from "next/server";
import sql from "@/db";
import AppNav from "../app-nav";
import LibraryBrand from "../library-brand";
import { requirePagePermission } from "@/lib/auth/dal";
import {
  defaultPermissionsFor,
  ROLES,
  type Permission,
  type Role,
} from "@/lib/auth/permissions";
import UserManager, { type ManagedUser } from "./user-manager";

export const metadata = {
  title: "Staff accounts",
};

// every request needs the session cookie before any data is read
export const instant = false;

type UserRow = Omit<ManagedUser, "role"> & { role: Role };

export default async function UsersPage() {
  await connection();

  const current = await requirePagePermission("users.manage");

  const rows = await sql<UserRow[]>`
    select
      u.id,
      u.name,
      u.email,
      u.role,
      u.permissions,
      u.is_active,
      coalesce(to_char(u.last_login_at, 'DD Mon YYYY HH24:MI'), 'never')
        as last_login_at,
      to_char(u.created_at, 'DD Mon YYYY') as created_at,
      (
        select count(*)::int
        from sessions s
        where s.user_id = u.id
          and s.revoked_at is null
          and s.expires_at > now()
      ) as active_sessions
    from users u
    order by u.is_active desc, u.role, u.name
  `;

  const defaults = Object.fromEntries(
    ROLES.map((role) => [role, defaultPermissionsFor(role)])
  ) as Record<Role, Permission[]>;

  const active = rows.filter((user) => user.is_active).length;
  const superAdmins = rows.filter(
    (user) => user.is_active && user.role === "super_admin"
  ).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <LibraryBrand />
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            Staff accounts
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Create accounts, assign roles and permissions, and manage access.
          </p>
        </div>
        <AppNav current="users" />
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Staff accounts
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {rows.length}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Active
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-green-600 dark:text-green-400">
            {active}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Active super administrators
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {superAdmins}
          </p>
        </div>
      </div>

      <UserManager
        users={rows}
        currentUserId={current.id}
        defaults={defaults}
      />
    </main>
  );
}
