import type { ReactNode } from "react";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getLibraryIdentity, todayHoursLabel } from "@/lib/settings";
import AppShell from "@/components/app-shell";
import { NAV_GROUPS, roleLabelFor } from "@/components/nav-config";

// the shell reads the session cookie on every request
export const instant = false;

export default async function AppLayout({ children }: { children: ReactNode }) {
  await connection();
  const user = await requireUser();
  const identity = await getLibraryIdentity();

  const allowedKeys = NAV_GROUPS.flatMap((group) => group.items)
    .filter(
      (item) =>
        (!item.permission || hasPermission(user, item.permission)) &&
        (!item.superAdminOnly || user.role === "super_admin")
    )
    .map((item) => item.key);

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        roleLabel: roleLabelFor(user.role),
      }}
      library={{
        name: identity.name,
        hoursLabel: todayHoursLabel(identity.openingHours),
        contactEmail: identity.contactEmail,
        noticeText: identity.noticeText,
        canSeeNotifications: hasPermission(user, "notifications.read"),
      }}
      allowedKeys={allowedKeys}
    >
      {children}
    </AppShell>
  );
}
