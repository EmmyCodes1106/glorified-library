import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "./session";
import { hasPermission, type Permission } from "./permissions";
import { logAudit } from "./audit";

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePagePermission(
  permission: Permission
): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) {
    await logAudit({
      action: "access.denied",
      summary: `${user.name} was denied access to ${permission}`,
      entityType: "user",
      entityId: user.id,
      actor: user,
      metadata: { permission, reason: "forbidden_page" },
    });
    redirect("/forbidden");
  }
  return user;
}

export type AuthorizationResult =
  | { ok: true; user: SessionUser }
  | { ok: false; message: string };

/**
 * Used at the top of every Server Action. Never trust a hidden button or a
 * protected page: the check belongs next to the database write.
 */
export async function authorize(
  permission: Permission,
  actionLabel?: string
): Promise<AuthorizationResult> {
  const user = await getCurrentUser();
  if (!user) {
    await logAudit({
      action: "access.denied",
      summary: `Signed-out attempt: ${actionLabel ?? permission}`,
      metadata: { permission, reason: "unauthenticated" },
    });
    return {
      ok: false,
      message: "Your session has expired. Sign in again.",
    };
  }
  if (!hasPermission(user, permission)) {
    await logAudit({
      action: "access.denied",
      summary: `${user.name} was denied ${actionLabel ?? permission}`,
      entityType: "user",
      entityId: user.id,
      actor: user,
      metadata: { permission, reason: "forbidden_action" },
    });
    return {
      ok: false,
      message: "You do not have permission to perform this action.",
    };
  }
  return { ok: true, user };
}
