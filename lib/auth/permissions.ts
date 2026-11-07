export const ROLES = ["super_admin", "administrator", "librarian"] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "books.read",
  "books.manage",
  "members.read",
  "members.manage",
  "circulation.read",
  "circulation.manage",
  "fines.read",
  "fines.manage",
  "reports.read",
  "reports.export",
  "notifications.read",
  "notifications.manage",
  "settings.manage",
  "users.manage",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Administrator",
  administrator: "Administrator",
  librarian: "Librarian",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: "Full system access, including account management and audit logs.",
  administrator:
    "Manages the catalogue, members, circulation, fines, notifications and reports.",
  librarian:
    "Manages circulation and member records, with read-only access to the catalogue and fines.",
};

const ADMINISTRATOR_PERMISSIONS: Permission[] = [
  "books.read",
  "books.manage",
  "members.read",
  "members.manage",
  "circulation.read",
  "circulation.manage",
  "fines.read",
  "fines.manage",
  "reports.read",
  "reports.export",
  "notifications.read",
  "notifications.manage",
  "settings.manage",
];

const LIBRARIAN_PERMISSIONS: Permission[] = [
  "books.read",
  "members.read",
  "members.manage",
  "circulation.read",
  "circulation.manage",
  "fines.read",
];

export const PERMISSION_GROUPS: {
  label: string;
  permissions: { key: Permission; label: string }[];
}[] = [
  {
    label: "Catalogue",
    permissions: [
      { key: "books.read", label: "View books and copies" },
      { key: "books.manage", label: "Add, edit and delete books" },
    ],
  },
  {
    label: "Members",
    permissions: [
      { key: "members.read", label: "View members and profiles" },
      { key: "members.manage", label: "Register, edit and suspend members" },
    ],
  },
  {
    label: "Circulation",
    permissions: [
      { key: "circulation.read", label: "View loans and returns" },
      { key: "circulation.manage", label: "Lend, renew and record returns" },
    ],
  },
  {
    label: "Fines",
    permissions: [
      { key: "fines.read", label: "View balances and fine history" },
      { key: "fines.manage", label: "Record payments and waivers" },
    ],
  },
  {
    label: "Reports",
    permissions: [
      { key: "reports.read", label: "View reports" },
      { key: "reports.export", label: "Export PDF and Excel reports" },
    ],
  },
  {
    label: "Notifications",
    permissions: [
      { key: "notifications.read", label: "View notification history" },
      { key: "notifications.manage", label: "Change preferences and send notices" },
    ],
  },
  {
    label: "System",
    permissions: [
      { key: "settings.manage", label: "Change loan, fine and library settings" },
      { key: "users.manage", label: "Manage staff accounts and roles" },
      { key: "audit.read", label: "Read the audit trail" },
    ],
  },
];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** System-wide permissions that only the super administrator role can hold. */
export const SUPER_ADMIN_ONLY_PERMISSIONS: Permission[] = [
  "users.manage",
  "audit.read",
];

export const ASSIGNABLE_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (permission) => !SUPER_ADMIN_ONLY_PERMISSIONS.includes(permission)
);

export const ASSIGNABLE_PERMISSION_GROUPS = PERMISSION_GROUPS.map((group) => ({
  ...group,
  permissions: group.permissions.filter((item) =>
    ASSIGNABLE_PERMISSIONS.includes(item.key)
  ),
})).filter((group) => group.permissions.length > 0);


export function isPermission(value: unknown): value is Permission {
  return (
    typeof value === "string" &&
    (PERMISSIONS as readonly string[]).includes(value)
  );
}

export function defaultPermissionsFor(role: Role): Permission[] {
  if (role === "super_admin") return [...PERMISSIONS];
  if (role === "administrator") return [...ADMINISTRATOR_PERMISSIONS];
  return [...LIBRARIAN_PERMISSIONS];
}

export function normalizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter(isPermission))];
}

export function hasPermission(
  user: { role: Role; permissions: readonly string[] },
  permission: Permission
) {
  if (user.role === "super_admin") return true;
  return user.permissions.includes(permission);
}

export function permissionLabel(permission: Permission) {
  for (const group of PERMISSION_GROUPS) {
    const found = group.permissions.find((item) => item.key === permission);
    if (found) return found.label;
  }
  return permission;
}
