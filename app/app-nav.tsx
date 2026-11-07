import Link from "next/link";
import { logoutAction } from "./auth-actions";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, ROLE_LABELS, type Permission } from "@/lib/auth/permissions";
import { getLibraryIdentity, todayHoursLabel } from "@/lib/settings";

type NavItem = {
  key: string;
  href: string;
  label: string;
  permission?: Permission;
};

const ITEMS: NavItem[] = [
  { key: "books", href: "/", label: "Books", permission: "books.read" },
  { key: "dashboard", href: "/dashboard", label: "Dashboard" },
  { key: "members", href: "/members", label: "Members", permission: "members.read" },
  { key: "circulation", href: "/circulation", label: "Circulation", permission: "circulation.read" },
  { key: "fines", href: "/fines", label: "Fines", permission: "fines.read" },
  { key: "reports", href: "/reports", label: "Reports", permission: "reports.read" },
  {
    key: "notifications",
    href: "/notifications",
    label: "Notifications",
    permission: "notifications.read",
  },
  { key: "users", href: "/users", label: "Staff", permission: "users.manage" },
  { key: "audit", href: "/audit", label: "Audit", permission: "audit.read" },
  {
    key: "settings",
    href: "/settings",
    label: "Settings",
    permission: "settings.manage",
  },
  { key: "account", href: "/account", label: "Account" },
];

export default async function AppNav({ current }: { current?: string }) {
  const [user, identity] = await Promise.all([
    getCurrentUser(),
    getLibraryIdentity(),
  ]);
  if (!user) return null;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <nav
        className="flex flex-wrap items-center gap-x-4 gap-y-2"
        aria-label="Main navigation"
      >
        {ITEMS.filter(
          (item) => !item.permission || hasPermission(user, item.permission)
        ).map((item) =>
          item.key === current ? (
            <span
              key={item.key}
              className="font-semibold"
              aria-current="page"
            >
              {item.label}
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="underline underline-offset-4"
            >
              {item.label}
            </Link>
          )
        )}
      </nav>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        <span>
          Signed in as{" "}
          <span className="font-medium text-foreground">{user.name}</span> ·{" "}
          {ROLE_LABELS[user.role]}
        </span>
        <span aria-hidden="true">·</span>
        <span>Open today: {todayHoursLabel(identity.openingHours)}</span>
        {identity.contactEmail && (
          <>
            <span aria-hidden="true">·</span>
            <a
              href={`mailto:${identity.contactEmail}`}
              className="underline underline-offset-4"
            >
              {identity.contactEmail}
            </a>
          </>
        )}
        <form action={logoutAction}>
          <button className="underline underline-offset-4">Sign out</button>
        </form>
      </div>
      {identity.noticeText && (
        <p className="whitespace-pre-line rounded border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          {identity.noticeText}
        </p>
      )}
    </div>
  );
}
