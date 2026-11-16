"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sql from "@/db";
import { logAudit } from "@/lib/auth/audit";
import {
  hashPassword,
  validatePassword,
  verifyAgainstDummy,
  verifyPassword,
} from "@/lib/auth/password";
import { requestContext } from "@/lib/auth/session";
import {
  clearMemberSessionCookie,
  createMemberSession,
  getCurrentMember,
  revokeMemberSession,
  revokeOtherMemberSessions,
} from "@/lib/member-auth/session";
import { issueEmailVerification } from "@/lib/email-verification";
import { getLendingSettings } from "@/lib/settings";

export type MemberFormState = {
  message: string;
  ok?: boolean;
  verifyEmail?: boolean;
  verificationEmail?: string;
};

const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const REGISTRATION_LIMIT = 5;
const REGISTRATION_WINDOW_MINUTES = 15;
const PASSWORD_REQUEST_LIMIT = 5;
const PASSWORD_REQUEST_WINDOW_MINUTES = 15;

const MEMBER_START_PAGES = [
  "/member",
  "/member/loans",
  "/member/history",
  "/member/fines",
  "/member/profile",
];

function normaliseEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function memberActor(member: { name: string; email: string | null }) {
  return {
    name: member.name,
    email: member.email ?? "unknown",
    role: "member",
  };
}

export async function registerMemberAction(
  _prev: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = normaliseEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!name) return { message: "Enter your full name." };
  if (name.length > 160) {
    return { message: "Names must be 160 characters or fewer." };
  }
  if (!validEmail(email)) return { message: "Enter a valid email address." };

  const policyError = validatePassword(password);
  if (policyError) return { message: policyError };
  if (password !== confirm) {
    return { message: "The two passwords do not match." };
  }

  const context = await requestContext();

  if (context.ipAddress) {
    const [recent] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from audit_logs
      where action = 'member.portal_registered'
        and ip_address = ${context.ipAddress}
        and created_at > now() - ${`${REGISTRATION_WINDOW_MINUTES} minutes`}::interval
    `;
    if (recent.count >= REGISTRATION_LIMIT) {
      return {
        message:
          "Too many sign-ups from this network. Try again in a few minutes.",
      };
    }
  }

  const [lending, passwordHash] = await Promise.all([
    getLendingSettings(),
    hashPassword(password),
  ]);
  const loanLimit = Math.min(Math.max(lending.defaultMemberLimit, 0), 100);

  type RegisterOutcome =
    | { error: string }
    | { id: number; name: string; email: string | null; linked: boolean };

  let outcome: RegisterOutcome;
  try {
    outcome = await sql.begin(async (tx): Promise<RegisterOutcome> => {
      const [existing] = await tx<
        {
          id: number;
          name: string;
          email: string | null;
          password_hash: string | null;
        }[]
      >`
        select id, name, email, password_hash
        from members
        where lower(email) = lower(${email})
        limit 1
      `;

      if (existing) {
        if (existing.password_hash) {
          return {
            error:
              "An account already exists for this email. Sign in, or ask library staff for a password reset.",
          };
        }
        const [linked] = await tx<
          { id: number; name: string; email: string | null }[]
        >`
          update members
          set
            password_hash = ${passwordHash},
            portal_registered_at = now(),
            email_verified_at = null,
            failed_login_attempts = 0,
            locked_until = null
          where id = ${existing.id}
          returning id, name, email
        `;
        return { ...linked, linked: true };
      }

      const [created] = await tx<
        { id: number; name: string; email: string | null }[]
      >`
        insert into members (
          name, email, password_hash, portal_registered_at, loan_limit,
          membership_expires_on
        )
        values (
          ${name}, ${email}, ${passwordHash}, now(), ${loanLimit},
          case
            when ${lending.membershipMonths} > 0
            then (current_date + make_interval(
              months => ${lending.membershipMonths}
            ))::date
            else null
          end
        )
        returning id, name, email
      `;
      return { ...created, linked: false };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return {
        message:
          "An account already exists for this email. Sign in, or ask library staff for a password reset.",
      };
    }
    throw error;
  }

  if ("error" in outcome) return { message: outcome.error };

  const delivery = await issueEmailVerification(
    {
      type: "member",
      id: outcome.id,
      name: outcome.name,
      email: outcome.email ?? email,
    }
  );

  await logAudit({
    action: "member.portal_registered",
    summary: outcome.linked
      ? `${outcome.name} activated their member portal account`
      : `${outcome.name} created a member portal account`,
    entityType: "member",
    entityId: outcome.id,
    actor: memberActor({ name: outcome.name, email: outcome.email }),
    context,
    metadata: {
      linkedToExistingRecord: outcome.linked,
      delivery: delivery.status,
    },
  });

  revalidatePath("/member", "layout");
  revalidatePath("/members");

  return {
    ok: true,
    verificationEmail: email,
    message: delivery.status === "sent"
      ? "Account created. Enter the six-digit code from your email to verify it before signing in."
      : "Account created, but the verification email could not be sent. Try resending in a minute or contact library staff.",
    verifyEmail: true,
  };
}

type MemberLoginRow = {
  id: number;
  name: string;
  email: string | null;
  password_hash: string;
  status: string;
  failed_login_attempts: number;
  locked_until: Date | null;
  email_verified_at: Date | null;
  expired: boolean;
};

export async function memberLoginAction(
  _prev: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  const email = normaliseEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const context = await requestContext();

  if (!email || !password) {
    return { message: "Enter your email address and password." };
  }
  if (email.length > 254 || password.length > 200) {
    return { message: GENERIC_LOGIN_ERROR };
  }

  const [member] = await sql<MemberLoginRow[]>`
    select
      id, name, email, password_hash, status, failed_login_attempts,
      locked_until, email_verified_at,
      (
        status = 'active'
        and membership_expires_on is not null
        and membership_expires_on < current_date
      ) as expired
    from members
    where lower(email) = lower(${email})
      and password_hash is not null
    limit 1
  `;

  if (!member) {
    await verifyAgainstDummy(password);
    await logAudit({
      action: "member.portal_login_failed",
      summary: `Failed member portal sign-in for ${email}`,
      actor: { name: "Unknown", email, role: "member" },
      context,
      metadata: { reason: "unknown_account" },
    });
    return { message: GENERIC_LOGIN_ERROR };
  }

  if (member.locked_until && member.locked_until.getTime() > Date.now()) {
    await verifyAgainstDummy(password);
    await logAudit({
      action: "member.portal_login_blocked",
      summary: `Member portal sign-in blocked for locked account ${member.email}`,
      entityType: "member",
      entityId: member.id,
      actor: memberActor(member),
      context,
    });
    const minutes = Math.max(
      1,
      Math.ceil((member.locked_until.getTime() - Date.now()) / 60000)
    );
    return {
      message: `Too many failed attempts. Try again in ${minutes} ${
        minutes === 1 ? "minute" : "minutes"
      }.`,
    };
  }

  const valid = await verifyPassword(password, member.password_hash);
  if (!valid) {
    const attempts = member.failed_login_attempts + 1;
    const lockedUntil =
      attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
        : null;

    await sql`
      update members
      set failed_login_attempts = ${attempts}, locked_until = ${lockedUntil}
      where id = ${member.id}
    `;

    await logAudit({
      action: "member.portal_login_failed",
      summary: `Failed member portal sign-in for ${member.email}`,
      entityType: "member",
      entityId: member.id,
      actor: memberActor(member),
      context,
      metadata: { attempts, locked: Boolean(lockedUntil) },
    });

    return {
      message: lockedUntil
        ? `Too many failed attempts. This account is locked for ${LOCK_MINUTES} minutes.`
        : GENERIC_LOGIN_ERROR,
    };
  }

  if (!member.email_verified_at) {
    await logAudit({
      action: "member.portal_login_blocked_unverified",
      summary: `Member portal sign-in blocked until ${member.email} confirms their email address`,
      entityType: "member",
      entityId: member.id,
      actor: memberActor(member),
      context,
      metadata: { reason: "email_unconfirmed" },
    });
    return {
      message:
        "Confirm your email address before signing in. Enter or request a new verification code below.",
      verifyEmail: true,
    };
  }

  const previous = await getCurrentMember();
  if (previous) {
    await revokeMemberSession(previous.sessionId, previous.id);
  }

  await sql`
    update members
    set
      failed_login_attempts = 0,
      locked_until = null,
      portal_last_login_at = now()
    where id = ${member.id}
  `;

  await createMemberSession(member.id);
  await logAudit({
    action: "member.portal_login",
    summary: `${member.name} signed in to the member portal`,
    entityType: "member",
    entityId: member.id,
    actor: memberActor(member),
    context,
    metadata: { status: member.expired ? "expired" : member.status },
  });

  const rawNext = String(formData.get("next") ?? "");
  const next = MEMBER_START_PAGES.includes(rawNext) ? rawNext : "/member";
  redirect(next);
}

export async function memberLogoutAction(): Promise<void> {
  const member = await getCurrentMember();
  if (member) {
    await revokeMemberSession(member.sessionId, member.id);
    await logAudit({
      action: "member.portal_logout",
      summary: `${member.name} signed out of the member portal`,
      entityType: "member",
      entityId: member.id,
      actor: memberActor(member),
    });
  }
  await clearMemberSessionCookie();
  redirect("/member/login");
}

// Members no longer reset their own portal password. A request lands in the
// Super Administrator queue, and staff set a temporary password from the
// member profile once they have confirmed the member's identity.
export async function requestMemberPasswordChangeAction(
  _prev: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  const email = normaliseEmail(formData.get("email"));
  const note = String(formData.get("note") ?? "").trim();
  const generic =
    "If that email belongs to a member portal account, your request has been sent to library staff.";

  if (!validEmail(email)) {
    return { message: "Enter a valid email address." };
  }
  if (note.length > 300) {
    return { message: "Keep your note to 300 characters or fewer." };
  }

  const context = await requestContext();

  if (context.ipAddress) {
    const [recent] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from audit_logs
      where action = 'member.portal_password_change_requested'
        and ip_address = ${context.ipAddress}
        and created_at > now() - ${`${PASSWORD_REQUEST_WINDOW_MINUTES} minutes`}::interval
    `;
    if (recent.count >= PASSWORD_REQUEST_LIMIT) {
      return {
        message:
          "Too many requests from this network. Try again in a few minutes.",
      };
    }
  }

  const [member] = await sql<
    { id: number; name: string; email: string | null }[]
  >`
    select id, name, email
    from members
    where lower(email) = lower(${email})
      and password_hash is not null
    limit 1
  `;

  if (member?.email) {
    const [created] = await sql<{ id: number }[]>`
      insert into member_password_requests (member_id, note)
      values (${member.id}, ${note || null})
      on conflict (member_id) where status = 'pending' do nothing
      returning id
    `;

    await logAudit({
      action: "member.portal_password_change_requested",
      summary: `Member portal password change requested for ${member.email}`,
      entityType: "member",
      entityId: member.id,
      actor: memberActor(member),
      context,
      metadata: { duplicate: !created },
    });
  } else {
    await verifyAgainstDummy(email);
    await logAudit({
      action: "member.portal_password_change_requested",
      summary: `Member portal password change requested for unknown email ${email}`,
      actor: { name: "Unknown", email, role: "member" },
      context,
      metadata: { duplicate: false },
    });
  }

  return { message: generic, ok: true };
}

export async function updateMemberProfileAction(
  _prev: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  const member = await getCurrentMember();
  if (!member) return { message: "Your session has expired. Sign in again." };

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!name) return { message: "Enter your full name." };
  if (name.length > 160) {
    return { message: "Names must be 160 characters or fewer." };
  }
  if (phone.length > 40) {
    return { message: "Phone numbers must be 40 characters or fewer." };
  }
  if (address.length > 500) {
    return { message: "Addresses must be 500 characters or fewer." };
  }

  await sql`
    update members
    set name = ${name}, phone = ${phone || null}, address = ${address || null}
    where id = ${member.id}
  `;

  await logAudit({
    action: "member.portal_profile_updated",
    summary: `${name} updated their member profile`,
    entityType: "member",
    entityId: member.id,
    actor: memberActor({ name, email: member.email }),
  });

  revalidatePath("/member/profile");
  revalidatePath("/member", "layout");
  revalidatePath("/members");
  revalidatePath(`/members/${member.id}`);
  return { message: "Profile updated.", ok: true };
}

export async function changeMemberPasswordAction(
  _prev: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  const member = await getCurrentMember();
  if (!member) return { message: "Your session has expired. Sign in again." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword) {
    return { message: "Enter your current password." };
  }
  const policyError = validatePassword(password);
  if (policyError) return { message: policyError };
  if (password !== confirm) {
    return { message: "The two new passwords do not match." };
  }

  const [row] = await sql<{ password_hash: string | null }[]>`
    select password_hash from members where id = ${member.id}
  `;
  if (
    !row?.password_hash ||
    !(await verifyPassword(currentPassword, row.password_hash))
  ) {
    return { message: "Your current password is incorrect." };
  }
  if (await verifyPassword(password, row.password_hash)) {
    return { message: "Choose a password you have not used for this account." };
  }

  const passwordHash = await hashPassword(password);
  await sql`
    update members
    set
      password_hash = ${passwordHash},
      failed_login_attempts = 0,
      locked_until = null
    where id = ${member.id}
  `;
  await revokeOtherMemberSessions(member.id, member.sessionId);

  await logAudit({
    action: "member.portal_password_changed",
    summary: `${member.name} changed their member portal password`,
    entityType: "member",
    entityId: member.id,
    actor: memberActor(member),
  });

  revalidatePath("/member/profile");
  return {
    message: "Password changed. Other portal sessions have been signed out.",
    ok: true,
  };
}

export async function renewMyLoan(
  _prev: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  const member = await getCurrentMember();
  if (!member) return { message: "Your session has expired. Sign in again." };
  if (member.status !== "active") {
    return {
      message:
        "Only an active membership can renew loans. Contact the library for help.",
    };
  }

  const loanId = Number(formData.get("loanId"));
  if (!Number.isInteger(loanId) || loanId < 1) {
    return { message: "Loan not found." };
  }

  type RenewOutcome =
    | { error: string }
    | { ok: true; title: string; due: string };

  const outcome = await sql.begin(async (tx): Promise<RenewOutcome> => {
    const [loan] = await tx<
      {
        id: number;
        title: string;
        returned_on: Date | null;
        duration_days: number;
        overdue: boolean;
        too_long: boolean;
      }[]
    >`
      select
        l.id,
        b.title,
        l.returned_on,
        l.duration_days,
        (l.due_on < current_date) as overdue,
        (
          greatest(l.due_on, current_date)
          + l.duration_days
          > current_date + 365
        ) as too_long
      from loans l
      join books b on b.id = l.book_id
      where l.id = ${loanId} and l.member_id = ${member.id}
      for update of l
    `;
    if (!loan) return { error: "Loan not found." };
    if (loan.returned_on) {
      return { error: "This loan is already closed." };
    }
    if (loan.overdue) {
      return {
        error:
          "This loan is overdue and cannot be renewed online. Contact the library.",
      };
    }
    if (loan.too_long) {
      return {
        error: "Renewing now would exceed the 365-day maximum loan term.",
      };
    }

    await tx`select accrue_fines()`;

    const [updated] = await tx<{ due: string }[]>`
      update loans
      set
        due_on = greatest(due_on, current_date) + duration_days,
        renewal_count = renewal_count + 1
      where id = ${loanId}
      returning to_char(due_on, 'DD Mon YYYY') as due
    `;

    return { ok: true as const, title: loan.title, due: updated.due };
  });

  if ("error" in outcome) return { message: outcome.error };

  await logAudit({
    action: "member.loan_renewed",
    summary: `${member.name} renewed "${outcome.title}" from the member portal`,
    entityType: "loan",
    entityId: loanId,
    actor: memberActor(member),
    metadata: { due: outcome.due, memberId: member.id },
  });

  revalidatePath("/member");
  revalidatePath("/member/loans");
  revalidatePath("/member/history");
  revalidatePath("/member/fines");
  revalidatePath("/dashboard");
  revalidatePath("/members");
  revalidatePath(`/members/${member.id}`);
  revalidatePath("/circulation");
  revalidatePath("/fines");
  return {
    message: `"${outcome.title}" renewed · due ${outcome.due}.`,
    ok: true,
  };
}
