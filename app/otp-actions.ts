"use server";

import { redirect } from "next/navigation";
import sql from "@/db";
import { logAudit } from "@/lib/auth/audit";
import { isRole } from "@/lib/auth/permissions";
import {
  createSession,
  getCurrentUser,
  requestContext,
  revokeSession,
} from "@/lib/auth/session";
import { sendCode, verifyCode } from "@/lib/otp";
import type { AuthFormState } from "@/app/auth-actions";

const INVALID_CODE = "That code is invalid or expired.";

type CodeUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  email_verified_at: Date | null;
  locked_until: Date | null;
};

async function findEligibleUser(email: string) {
  const [user] = await sql<CodeUser[]>`
    select id, name, email, role, is_active, email_verified_at, locked_until
    from users
    where lower(email) = lower(${email})
    limit 1
  `;
  const locked = user?.locked_until && user.locked_until.getTime() > Date.now();
  if (!user || !user.is_active || !user.email_verified_at || locked || !isRole(user.role)) {
    return null;
  }
  return user;
}

export async function requestLoginCodeAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { message: "Enter a valid email address." };
  }

  // Same result whether or not the account exists or is allowed to sign in
  if (await findEligibleUser(email)) await sendCode(email, "login");

  redirect(`/login/verify?email=${encodeURIComponent(email)}`);
}

export async function verifyLoginCodeAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const context = await requestContext();

  const user = await findEligibleUser(email);
  const valid = user && code.length === 6 && (await verifyCode(email, "login", code));

  if (!user || !valid) {
    await logAudit({
      action: "auth.login_failed",
      summary: `Failed code sign-in for ${email}`,
      actor: { name: "Unknown", email, role: null },
      context,
      metadata: { method: "email_code" },
    });
    return { message: INVALID_CODE };
  }

  const previous = await getCurrentUser();
  if (previous) await revokeSession(previous.sessionId, previous.id);

  await sql`
    update users
    set failed_login_attempts = 0, locked_until = null,
        last_login_at = now(), updated_at = now()
    where id = ${user.id}
  `;

  await createSession(user.id);
  await logAudit({
    action: "auth.login",
    summary: `${user.name} signed in with an email code`,
    entityType: "user",
    entityId: user.id,
    actor: { id: user.id, name: user.name, email: user.email, role: user.role },
    context,
    metadata: { method: "email_code" },
  });

  redirect("/dashboard");
}