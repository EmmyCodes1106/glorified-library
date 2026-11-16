import type { Permission, Role } from "@/lib/auth/permissions";

export type NavIcon =
  | "dashboard"
  | "books"
  | "members"
  | "borrowing"
  | "returns"
  | "fines"
  | "reports"
  | "notifications"
  | "audit"
  | "staff"
  | "settings"
  | "account";

export type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: NavIcon;
  permission?: Permission;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        key: "dashboard",
        href: "/dashboard",
        label: "Dashboard",
        icon: "dashboard",
      },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { key: "books", href: "/", label: "Books", icon: "books", permission: "books.read" },
      {
        key: "members",
        href: "/members",
        label: "Members",
        icon: "members",
        permission: "members.read",
      },
    ],
  },
  {
    label: "Circulation",
    items: [
      {
        key: "circulation",
        href: "/circulation",
        label: "Borrowing",
        icon: "borrowing",
        permission: "circulation.read",
      },
      {
        key: "returns",
        href: "/returns",
        label: "Returns",
        icon: "returns",
        permission: "circulation.read",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        key: "fines",
        href: "/fines",
        label: "Fines",
        icon: "fines",
        permission: "fines.read",
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        key: "reports",
        href: "/reports",
        label: "Reports",
        icon: "reports",
        permission: "reports.read",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        key: "notifications",
        href: "/notifications",
        label: "Notifications",
        icon: "notifications",
        permission: "notifications.read",
      },
      {
        key: "audit",
        href: "/audit",
        label: "Activity log",
        icon: "audit",
        permission: "audit.read",
      },
      {
        key: "users",
        href: "/users",
        label: "Staff",
        icon: "staff",
        permission: "users.manage",
      },
      {
        key: "settings",
        href: "/settings",
        label: "Settings",
        icon: "settings",
        permission: "settings.manage",
      },
    ],
  },
];

export const PROFILE_ITEM: NavItem = {
  key: "account",
  href: "/account",
  label: "Your account",
  icon: "account",
};

export function isItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/members") return pathname.startsWith("/members");
  return pathname === href;
}

export function pageTitleFor(pathname: string) {
  if (pathname === "/members" || pathname.startsWith("/members/")) {
    return pathname === "/members" ? "Members" : "Member profile";
  }
  if (pathname === "/account") return "Your account";
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isItemActive(pathname, item.href)) return item.label;
    }
  }
  return "Dashboard";
}

export function breadcrumbFor(pathname: string): string[] {
  const title = pageTitleFor(pathname);
  if (pathname === "/") return ["Catalogue", "Books"];
  if (pathname.startsWith("/members/")) return ["Catalogue", "Members", "Profile"];
  if (pathname === "/members") return ["Catalogue", "Members"];
  if (pathname === "/circulation") return ["Circulation", "Borrowing"];
  if (pathname === "/returns") return ["Circulation", "Returns"];
  if (pathname === "/fines") return ["Finance", "Fines"];
  if (pathname === "/reports") return ["Insights", "Reports"];
  if (pathname === "/notifications") return ["Administration", "Notifications"];
  if (pathname === "/audit") return ["Administration", "Activity log"];
  if (pathname === "/users") return ["Administration", "Staff"];
  if (pathname === "/settings") return ["Administration", "Settings"];
  if (pathname === "/account") return ["Account", title];
  return [title];
}

export function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function roleLabelFor(role: Role) {
  if (role === "super_admin") return "Super administrator";
  if (role === "administrator") return "Administrator";
  return "Librarian";
}
