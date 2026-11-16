"use server";

import { revalidatePath } from "next/cache";
import sql from "@/db";
import { logAudit } from "@/lib/auth/audit";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { getCurrentUser } from "@/lib/auth/session";
import { revokeAllMemberSessions } from "@/lib/member-auth/session";

export type PortalPasswordState = { message: string; ok?: boolean };

const NOT_ALLOWED =
  "Only a Super Administrator can reset member portal passwords.";

export async function setMemberPortalPasswordAction(
  _prev: PortalPasswordState,
  formData: FormData
): Promise<PortalPasswordState> {
  const staff = await getCurrentUser();
  if (!staff) return { message: "Your session has expired. Sign in again." };
  if (staff.role !== "super_admin") return { message: NOT_ALLOWED };

  const memberId = Number(formData.get("memberId"));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!Number.isInteger(memberId) || memberId < 1) {
    return { message: "Member not found." };
  }

  const policyError = validatePassword(password);
  if (policyError) return { message: policyError };
  if (password !== confirm) {
    return { message: "The two passwords do not match." };
  }

  const [member] = await sql<
    { name: string; email_verified: boolean }[]
  >`
    select name, (email_verified_at is not null) as email_verified
    from members
    where id = ${memberId}
  `;
  if (!member) return { message: "Member not found." };

  const passwordHash = await hashPassword(password);

  const resolvedRequests = await sql.begin(async (tx) => {
    await tx`
      update members
      set
        password_hash = ${passwordHash},
        portal_registered_at = coalesce(portal_registered_at, now()),
        failed_login_attempts = 0,
        locked_until = null
      where id = ${memberId}
    `;
    const resolved = await tx<{ id: number }[]>`
      update member_password_requests
      set status = 'resolved', resolved_at = now(), resolved_by = ${staff.id}
      where member_id = ${memberId} and status = 'pending'
      returning id
    `;
    return resolved.length;
  });

  await revokeAllMemberSessions(memberId);

  await logAudit({
    action: "member.portal_password_reset_by_admin",
    summary: `${staff.name} set a temporary member portal password for ${member.name}`,
    entityType: "member",
    entityId: memberId,
    actor: staff,
    metadata: { requestsResolved: resolvedRequests },
  });

  revalidatePath(`/members/${memberId}`);
  revalidatePath("/members");
  revalidatePath("/dashboard");

  return {
    message: member.email_verified
      ? "Temporary password set. Every portal session for this member was signed out."
      : "Temporary password set, but this member must confirm their email address before signing in.",
    ok: true,
  };
}

export async function dismissMemberPasswordRequestAction(
  _prev: PortalPasswordState,
  formData: FormData
): Promise<PortalPasswordState> {
  const staff = await getCurrentUser();
  if (!staff) return { message: "Your session has expired. Sign in again." };
  if (staff.role !== "super_admin") return { message: NOT_ALLOWED };

  const memberId = Number(formData.get("memberId"));
  if (!Number.isInteger(memberId) || memberId < 1) {
    return { message: "Member not found." };
  }

  const dismissed = await sql<{ id: number }[]>`
    update member_password_requests
    set status = 'dismissed', resolved_at = now(), resolved_by = ${staff.id}
    where member_id = ${memberId} and status = 'pending'
    returning id
  `;
  if (dismissed.length === 0) {
    return { message: "There is no pending password request for this member." };
  }

  await logAudit({
    action: "member.portal_password_request_dismissed",
    summary: `${staff.name} dismissed a member portal password request`,
    entityType: "member",
    entityId: memberId,
    actor: staff,
  });

  revalidatePath(`/members/${memberId}`);
  revalidatePath("/dashboard");

  return { message: "Request dismissed.", ok: true };
}
