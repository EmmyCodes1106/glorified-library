import "server-only";

import { randomInt } from "node:crypto";
import sql from "@/db";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { sendLoggedEmail, type EmailResult } from "@/lib/email";
import { getLibraryIdentity } from "@/lib/settings";

export const VERIFICATION_CODE_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const SEND_LIMIT_PER_HOUR = 5;
const MAX_CODE_ATTEMPTS = 5;
const INVALID_CODE = "This code is incorrect, expired or no longer usable. Request a new code if needed.";

export type VerificationSubject =
  | { type: "staff"; id: number; name: string; email: string }
  | { type: "member"; id: number; name: string; email: string };

export type StaffAccountState = "active" | "pending" | "deactivated";

export type ConfirmedSubject =
  | {
      type: "staff";
      id: number;
      name: string;
      email: string;
      role: string;
      accountState: StaffAccountState;
    }
  | { type: "member"; id: number; name: string; email: string };

export type ConfirmOutcome =
  | { ok: true; subject: ConfirmedSubject }
  | { ok: false; message: string };

export async function issueEmailVerification(
  subject: VerificationSubject
): Promise<EmailResult> {
  const issued = await sql.begin(async (tx): Promise<{ reason: string } | { id: number; code: string }> => {
    // Lock the account before its codes so resend and confirmation cannot race.
    const [account] = subject.type === "staff"
      ? await tx`select email, email_verified_at from users where id = ${subject.id} for update`
      : await tx`select email, email_verified_at from members where id = ${subject.id} and password_hash is not null for update`;
    if (!account || account.email_verified_at || account.email?.toLowerCase() !== subject.email.toLowerCase()) {
      return { reason: "This account does not need email verification." };
    }

    const owner = subject.type === "staff"
      ? tx`user_id = ${subject.id}`
      : tx`member_id = ${subject.id}`;
    const [recent] = await tx<{ count: number; cooling_down: boolean }[]>`
      select count(*)::int as count,
        coalesce(bool_or(created_at > now() - ${`${RESEND_COOLDOWN_SECONDS} seconds`}::interval), false) as cooling_down
      from email_verifications
      where ${owner} and created_at > now() - interval '1 hour'
    `;
    if (recent.cooling_down) {
      return { reason: "Wait at least 60 seconds before requesting another verification code." };
    }
    if (recent.count >= SEND_LIMIT_PER_HOUR) {
      return { reason: "Too many verification codes requested. Try again in an hour." };
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = await hashPassword(code);
    await tx`update email_verifications set used_at = now() where ${owner} and used_at is null`;
    const [row] = await tx<{ id: number }[]>`
      insert into email_verifications (user_id, member_id, email, token_hash, expires_at)
      values (
        ${subject.type === "staff" ? subject.id : null},
        ${subject.type === "member" ? subject.id : null},
        ${subject.email.toLowerCase()}, ${codeHash},
        now() + ${`${VERIFICATION_CODE_MINUTES} minutes`}::interval
      ) returning id
    `;
    return { id: row.id, code };
  });

  if ("reason" in issued) return { status: "skipped", reason: issued.reason };

  const identity = await getLibraryIdentity();
  const staff = subject.type === "staff";
  const delivery = await sendLoggedEmail({
    to: subject.email,
    subject: `Your ${identity.name} ${staff ? "staff" : "member"} verification code`,
    purpose: staff ? "staff_verification" : "member_verification",
    text: [
      `Hello ${subject.name},`,
      "",
      `Your email verification code is: ${issued.code}`,
      `Enter this six-digit code on the ${staff ? "staff" : "member"} signup or email verification screen.`,
      `It expires in ${VERIFICATION_CODE_MINUTES} minutes and can only be used once.`,
      "Requesting a new code replaces any previous code. Never share this code with anyone.",
      "",
      staff
        ? "After you confirm, a super administrator still needs to approve your account before you can sign in."
        : "Once confirmed, you can sign in to view your loans, due dates and fines.",
      "",
      "If you did not request this, you can ignore this message.",
    ].join("\n"),
  });
  if (delivery.status !== "sent") {
    await sql`update email_verifications set used_at = now() where id = ${issued.id} and used_at is null`;
  }
  return delivery;
}

type StaffRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  approved_at: Date | null;
  email_verified_at: Date | null;
};

type MemberRow = {
  id: number;
  name: string;
  email: string;
  email_verified_at: Date | null;
};

export async function confirmEmailCode(
  accountType: "staff" | "member",
  email: string,
  code: string
): Promise<ConfirmOutcome> {
  return sql.begin(async (tx): Promise<ConfirmOutcome> => {
    const [staff] = accountType === "staff"
      ? await tx<StaffRow[]>`
          select id, name, email, role, is_active, approved_at, email_verified_at
          from users where lower(email) = ${email} for update
        `
      : [];
    const [member] = accountType === "member"
      ? await tx<MemberRow[]>`
          select id, name, email, email_verified_at from members
          where lower(email) = ${email} and password_hash is not null for update
        `
      : [];
    const account = staff ?? member;
    if (!account || account.email_verified_at) {
      await verifyAgainstDummy(code);
      return { ok: false, message: INVALID_CODE };
    }

    const owner = staff ? tx`user_id = ${staff.id}` : tx`member_id = ${member.id}`;
    const [row] = await tx<{ id: number; token_hash: string; attempts: number }[]>`
      select id, token_hash, attempts from email_verifications
      where ${owner} and lower(email) = ${email}
        and used_at is null and expires_at > now()
      order by created_at desc, id desc limit 1 for update
    `;
    if (!row || row.attempts >= MAX_CODE_ATTEMPTS) {
      await verifyAgainstDummy(code);
      return { ok: false, message: INVALID_CODE };
    }
    const matches = await verifyPassword(code, row.token_hash);
    await tx`update email_verifications set attempts = attempts + 1 where id = ${row.id}`;
    if (!matches) {
      if (row.attempts + 1 >= MAX_CODE_ATTEMPTS) {
        await tx`update email_verifications set used_at = now() where id = ${row.id}`;
      }
      return { ok: false, message: INVALID_CODE };
    }

    await tx`update email_verifications set used_at = now() where ${owner} and used_at is null`;
    if (staff) {
      await tx`update users set email_verified_at = now() where id = ${staff.id}`;
      return {
        ok: true,
        subject: {
          type: "staff", id: staff.id, name: staff.name, email: staff.email,
          role: staff.role,
          accountState: staff.approved_at === null ? "pending" : staff.is_active ? "active" : "deactivated",
        },
      };
    }

    await tx`update members set email_verified_at = now() where id = ${member.id}`;
    return {
      ok: true,
      subject: { type: "member", id: member.id, name: member.name, email: member.email },
    };
  });
}
