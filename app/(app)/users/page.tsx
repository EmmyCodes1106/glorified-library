import { connection } from "next/server";
import { ShieldCheck, UserCheck, Users } from "lucide-react";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import {
  defaultPermissionsFor,
  ROLES,
  type Permission,
  type Role,
} from "@/lib/auth/permissions";
import { PageIntro, StatCard } from "@/components/ui";
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
      (u.email_verified_at is not null) as email_verified,
      (u.approved_at is null and not u.is_active) as pending,
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
    order by
      (u.approved_at is null and not u.is_active) desc,
      u.is_active desc, u.role, u.name
  `;

  const defaults = Object.fromEntries(
    ROLES.map((role) => [role, defaultPermissionsFor(role)])
  ) as Record<Role, Permission[]>;

  const active = rows.filter((user) => user.is_active).length;
  const pending = rows.filter((user) => user.pending).length;
  const superAdmins = rows.filter(
    (user) => user.is_active && user.role === "super_admin"
  ).length;
  const signedIn = rows.filter((user) => user.active_sessions > 0).length;

  return (
    <div className="space-y-6">
      <PageIntro>
        Create accounts, review access requests, assign roles and permissions,
        and manage access.
      </PageIntro>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Staff accounts"
          value={rows.length}
          hint={
            pending > 0
              ? `${pending} awaiting approval`
              : "Everyone with a login"
          }
          icon={Users}
          tone="brand"
        />
        <StatCard
          label="Active"
          value={active}
          hint="Accounts allowed to sign in"
          icon={UserCheck}
          tone="success"
        />
        <StatCard
          label="Active super administrators"
          value={superAdmins}
          hint={`${signedIn} with a current session`}
          icon={ShieldCheck}
          tone="neutral"
        />
      </div>

      <UserManager
        users={rows}
        currentUserId={current.id}
        defaults={defaults}
      />
    </div>
  );
}
