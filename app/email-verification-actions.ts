"use server";

import sql from "@/db";
import { logAudit } from "@/lib/auth/audit";
import { verifyAgainstDummy } from "@/lib/auth/password";
import { requestContext } from "@/lib/auth/session";
import {
  confirmEmailCode,
  issueEmailVerification,
  type VerificationSubject,
} from "@/lib/email-verification";

export type VerifyEmailState = {
  message: string;
  ok?: boolean;
  nextHref?: string;
  nextLabel?: string;
};

const GENERIC_RESEND =
  "If this account needs verification and sending is available, a code will be emailed. Check your inbox and spam folder. Wait at least 60 seconds between requests; after several requests, try again in an hour.";

function normaliseEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function reserveVerificationRequest(
  action: "auth.verification_requested" | "auth.verification_attempted",
  email: string,
  accountType: "staff" | "member",
  context: Awaited<ReturnType<typeof requestContext>>
): Promise<boolean> {
  const limit = action === "auth.verification_requested" ? 5 : 20;
  return sql.begin(async (tx) => {
    // Reserve the quota atomically, before expensive hashing or email delivery.
    await tx`select pg_advisory_xact_lock(hashtext(${`${action}:${context.ipAddress ?? "unknown"}`}))`;
    const [recent] = await tx<{ count: number }[]>`
      select count(*)::int as count from audit_logs
      where action = ${action}
        and ip_address is not distinct from ${context.ipAddress}
        and created_at > now() - interval '15 minutes'
    `;
    if (recent.count >= limit) return false;
    await tx`
      insert into audit_logs (
        actor_name, actor_email, action, summary, metadata, ip_address, user_agent
      ) values (
        'Unverified visitor', ${email}, ${action},
        ${action === "auth.verification_requested" ? "Email verification code requested" : "Email verification code submitted"},
        ${tx.json({ accountType })}, ${context.ipAddress}, ${context.userAgent}
      )
    `;
    return true;
  });
}

export async function requestVerificationEmailAction(
  _prev: VerifyEmailState,
  formData: FormData
): Promise<VerifyEmailState> {
  const email = normaliseEmail(formData.get("email"));
  const accountType = formData.get("accountType");
  if (!validEmail(email)) return { message: "Enter a valid email address." };
  if (accountType !== "staff" && accountType !== "member") {
    return { message: "Choose a staff or member account." };
  }

  const context = await requestContext();
  if (!(await reserveVerificationRequest("auth.verification_requested", email, accountType, context))) {
    return { message: GENERIC_RESEND, ok: true };
  }

  let subject: VerificationSubject | null = null;
  if (accountType === "staff") {
    const [staff] = await sql<{ id: number; name: string; email: string }[]>`
      select id, name, email from users
      where lower(email) = ${email} and email_verified_at is null limit 1
    `;
    if (staff) subject = { type: "staff", ...staff };
  } else {
    const [member] = await sql<{ id: number; name: string; email: string }[]>`
      select id, name, email from members
      where lower(email) = ${email} and password_hash is not null
        and email_verified_at is null limit 1
    `;
    if (member) subject = { type: "member", ...member };
  }

  let delivery = "not_applicable";
  if (subject) {
    const result = await issueEmailVerification(subject);
    delivery = result.status;
  } else {
    await verifyAgainstDummy(email);
  }

  await logAudit({
    action: "auth.verification_delivery",
    summary: "Email verification request processed",
    entityType: subject ? subject.type === "staff" ? "user" : "member" : null,
    entityId: subject?.id ?? null,
    actor: { name: subject?.name ?? "Unknown", email },
    context,
    metadata: { delivery, accountType },
  });

  return { message: GENERIC_RESEND, ok: true };
}

export async function confirmEmailAction(
  _prev: VerifyEmailState,
  formData: FormData
): Promise<VerifyEmailState> {
  const email = normaliseEmail(formData.get("email"));
  const accountType = formData.get("accountType");
  const code = String(formData.get("code") ?? "").trim();
  if (!validEmail(email)) return { message: "Enter a valid email address." };
  if (accountType !== "staff" && accountType !== "member") {
    return { message: "Choose a staff or member account." };
  }
  if (!/^\d{6}$/.test(code)) {
    return { message: "Enter the six-digit code from your email." };
  }

  const context = await requestContext();
  if (!(await reserveVerificationRequest("auth.verification_attempted", email, accountType, context))) {
    return { message: "Too many verification attempts from this network. Try again in 15 minutes." };
  }
  const outcome = await confirmEmailCode(accountType, email, code);
  if (!outcome.ok) return { message: outcome.message };

  const subject = outcome.subject;

  if (subject.type === "staff") {
    await logAudit({
      action: "auth.email_verified",
      summary: `${subject.name} confirmed their staff email address`,
      entityType: "user",
      entityId: subject.id,
      actor: {
        id: subject.id,
        name: subject.name,
        email: subject.email,
        role: subject.role,
      },
    });

    if (subject.accountState === "pending") {
      return {
        ok: true,
        message:
          "Email confirmed. A super administrator still needs to approve your account before you can sign in.",
        nextHref: "/login",
        nextLabel: "Back to staff sign in",
      };
    }

    if (subject.accountState === "deactivated") {
      return {
        ok: true,
        message:
          "Email confirmed. This account is deactivated; contact a super administrator to restore access.",
        nextHref: "/login",
        nextLabel: "Back to staff sign in",
      };
    }

    return {
      ok: true,
      message: "Email confirmed. You can sign in now.",
      nextHref: "/login",
      nextLabel: "Continue to staff sign in",
    };
  }

  await logAudit({
    action: "member.portal_email_verified",
    summary: `${subject.name} confirmed their member portal email address`,
    entityType: "member",
    entityId: subject.id,
    actor: { name: subject.name, email: subject.email, role: "member" },
  });

  return {
    ok: true,
    message: "Email confirmed. You can sign in to the member portal now.",
    nextHref: "/member/login",
    nextLabel: "Continue to member sign in",
  };
}
