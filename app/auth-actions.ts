"use server";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sql from "@/db";
import { logAudit } from "@/lib/auth/audit";
import {
  getCurrentUser,
  hashSessionToken,
  requestContext,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
  createSession,
  clearSessionCookie,
} from "@/lib/auth/session";
import {
  ASSIGNABLE_PERMISSIONS,
  defaultPermissionsFor,
  isRole,
  normalizePermissions,
  type Permission,
  type Role,
} from "@/lib/auth/permissions";
import {
  hashPassword,
  validatePassword,
  verifyAgainstDummy,
  verifyPassword,
} from "@/lib/auth/password";
import { sendEmail } from "@/lib/email";
import { getLibraryIdentity } from "@/lib/settings";

export type AuthFormState = {
  message: string;
  ok?: boolean;
  resetLink?: string;
};

const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function normaliseEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function appBaseUrl() {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "http://localhost:3000";
}

function newOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

function matchesSecret(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function resolvePermissions(role: Role, formData: FormData): Permission[] {
  if (role === "super_admin") return defaultPermissionsFor(role);
  if (formData.get("permissionsProvided") !== "1") {
    return defaultPermissionsFor(role);
  }
  return normalizePermissions(formData.getAll("permissions").map(String)).filter(
    (permission) => ASSIGNABLE_PERMISSIONS.includes(permission)
  );
}

type LoginRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
};

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = normaliseEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const context = await requestContext();

  if (!email || !password) {
    return { message: "Enter your email address and password." };
  }
  if (email.length > 254 || password.length > 200) {
    return { message: GENERIC_LOGIN_ERROR };
  }

  const [user] = await sql<LoginRow[]>`
    select
      id, name, email, password_hash, role, is_active,
      failed_login_attempts, locked_until
    from users
    where lower(email) = lower(${email})
    limit 1
  `;

  if (!user) {
    await verifyAgainstDummy(password);
    await logAudit({
      action: "auth.login_failed",
      summary: `Failed sign-in for ${email}`,
      actor: { name: "Unknown", email, role: null },
      context,
      metadata: { reason: "unknown_account" },
    });
    return { message: GENERIC_LOGIN_ERROR };
  }

  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    await verifyAgainstDummy(password);
    await logAudit({
      action: "auth.login_blocked",
      summary: `Sign-in blocked for locked account ${user.email}`,
      entityType: "user",
      entityId: user.id,
      actor: { id: user.id, name: user.name, email: user.email, role: user.role },
      context,
    });
    const minutes = Math.max(
      1,
      Math.ceil((user.locked_until.getTime() - Date.now()) / 60000)
    );
    return {
      message: `Too many failed attempts. Try again in ${minutes} ${
        minutes === 1 ? "minute" : "minutes"
      }.`,
    };
  }

  if (!user.is_active) {
    await verifyAgainstDummy(password);
    await logAudit({
      action: "auth.login_failed",
      summary: `Deactivated account tried to sign in: ${user.email}`,
      entityType: "user",
      entityId: user.id,
      actor: { id: user.id, name: user.name, email: user.email, role: user.role },
      context,
      metadata: { reason: "inactive" },
    });
    return {
      message: "This account is deactivated. Contact a super administrator.",
    };
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    const attempts = user.failed_login_attempts + 1;
    const lockedUntil =
      attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
        : null;

    await sql`
      update users
      set
        failed_login_attempts = ${attempts},
        locked_until = ${lockedUntil},
        updated_at = now()
      where id = ${user.id}
    `;

    await logAudit({
      action: "auth.login_failed",
      summary: `Failed sign-in for ${user.email}`,
      entityType: "user",
      entityId: user.id,
      actor: { id: user.id, name: user.name, email: user.email, role: user.role },
      context,
      metadata: { attempts, locked: Boolean(lockedUntil) },
    });

    return {
      message: lockedUntil
        ? `Too many failed attempts. This account is locked for ${LOCK_MINUTES} minutes.`
        : GENERIC_LOGIN_ERROR,
    };
  }

  if (!isRole(user.role)) {
    return { message: "This account has an invalid role. Contact a super administrator." };
  }

  const previous = await getCurrentUser();
  if (previous) {
    await revokeSession(previous.sessionId, previous.id);
  }

  await sql`
    update users
    set
      failed_login_attempts = 0,
      locked_until = null,
      last_login_at = now(),
      updated_at = now()
    where id = ${user.id}
  `;

  await createSession(user.id);
  await logAudit({
    action: "auth.login",
    summary: `${user.name} signed in`,
    entityType: "user",
    entityId: user.id,
    actor: { id: user.id, name: user.name, email: user.email, role: user.role },
    context,
  });

  const rawNext = String(formData.get("next") ?? "");
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && rawNext !== "/login"
      ? rawNext
      : "/dashboard";
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await revokeSession(user.sessionId, user.id);
    await logAudit({
      action: "auth.logout",
      summary: `${user.name} signed out`,
      entityType: "user",
      entityId: user.id,
      actor: user,
    });
  }
  await clearSessionCookie();
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = normaliseEmail(formData.get("email"));
  const generic =
    "If that email belongs to an active account, a reset link has been sent.";

  if (!validEmail(email)) {
    return { message: "Enter a valid email address." };
  }

  const context = await requestContext();
  const [user] = await sql<{ id: number; name: string; email: string; role: string }[]>`
    select id, name, email, role
    from users
    where lower(email) = lower(${email}) and is_active
    limit 1
  `;

  if (user) {
    await sql`
      update password_resets
      set used_at = now()
      where user_id = ${user.id} and used_at is null
    `;

    const token = newOpaqueToken();
    await sql`
      insert into password_resets (user_id, token_hash, expires_at)
      values (
        ${user.id}, ${hashSessionToken(token)}, now() + interval '1 hour'
      )
    `;

    const link = `${appBaseUrl()}/reset-password?token=${token}`;
    const identity = await getLibraryIdentity();
    const delivery = await sendEmail({
      to: user.email,
      subject: `Reset your ${identity.name} password`,
      text: [
        `Hello ${user.name},`,
        "",
        `Someone requested a password reset for your ${identity.name} account.`,
        `Open this link within one hour to choose a new password: ${link}`,
        "",
        "If you did not request this, you can ignore this message. Your password will not change.",
      ].join("\n"),
    });

    await logAudit({
      action: "auth.password_reset_requested",
      summary: `Password reset requested for ${user.email}`,
      entityType: "user",
      entityId: user.id,
      actor: { id: user.id, name: user.name, email: user.email, role: user.role },
      context,
      metadata: { delivery: delivery.status },
    });
  } else {
    await verifyAgainstDummy(email);
    await logAudit({
      action: "auth.password_reset_requested",
      summary: `Password reset requested for unknown or inactive email ${email}`,
      actor: { name: "Unknown", email, role: null },
      context,
      metadata: { delivery: "not_applicable" },
    });
  }

  return { message: generic, ok: true };
}

type ResetRow = {
  reset_id: number;
  user_id: number;
  name: string;
  email: string;
  role: string;
};

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!token) {
    return { message: "This reset link is invalid. Request a new one." };
  }

  const policyError = validatePassword(password);
  if (policyError) return { message: policyError };
  if (password !== confirm) {
    return { message: "The two passwords do not match." };
  }

  const [reset] = await sql<ResetRow[]>`
    select
      pr.id as reset_id,
      pr.user_id,
      u.name,
      u.email,
      u.role
    from password_resets pr
    join users u on u.id = pr.user_id
    where pr.token_hash = ${hashSessionToken(token)}
      and pr.used_at is null
      and pr.expires_at > now()
      and u.is_active
    limit 1
  `;

  if (!reset) {
    return {
      message:
        "This reset link is invalid or has expired. Request a new link from your administrator.",
    };
  }

  const passwordHash = await hashPassword(password);

  await sql.begin(async (tx) => {
    await tx`
      update users
      set
        password_hash = ${passwordHash},
        password_changed_at = now(),
        failed_login_attempts = 0,
        locked_until = null,
        updated_at = now()
      where id = ${reset.user_id}
    `;
    await tx`
      update password_resets set used_at = now()
      where id = ${reset.reset_id}
    `;
    await tx`
      update sessions set revoked_at = now()
      where user_id = ${reset.user_id} and revoked_at is null
    `;
  });

  await logAudit({
    action: "auth.password_reset_completed",
    summary: `Password reset completed for ${reset.email}`,
    entityType: "user",
    entityId: reset.user_id,
    actor: {
      id: reset.user_id,
      name: reset.name,
      email: reset.email,
      role: reset.role,
    },
  });

  redirect("/login?reset=1");
}

export async function setupAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const [counts] = await sql<{ count: number }[]>`
    select count(*)::int as count from users
  `;
  if (counts.count > 0) {
    return {
      message: "Setup has already been completed. Sign in with your account.",
    };
  }

  const expected = (process.env.AUTH_SETUP_TOKEN ?? "").trim();
  const provided = String(formData.get("setupToken") ?? "").trim();
  if (!expected) {
    return {
      message:
        "First-run setup is locked. Set AUTH_SETUP_TOKEN on the server, then restart the app.",
    };
  }
  if (!provided || !matchesSecret(provided, expected)) {
    return { message: "The setup token is incorrect." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = normaliseEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!name) return { message: "Enter your full name." };
  if (name.length > 160) return { message: "Names must be 160 characters or fewer." };
  if (!validEmail(email)) return { message: "Enter a valid email address." };

  const policyError = validatePassword(password);
  if (policyError) return { message: policyError };
  if (password !== confirm) {
    return { message: "The two passwords do not match." };
  }

  const passwordHash = await hashPassword(password);
  const permissions = defaultPermissionsFor("super_admin");

  let created: { id: number; name: string; email: string; role: string };
  try {
    [created] = await sql<{ id: number; name: string; email: string; role: string }[]>`
      insert into users (name, email, password_hash, role, permissions)
      values (
        ${name}, ${email}, ${passwordHash}, 'super_admin',
        ${permissions}
      )
      returning id, name, email, role
    `;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return { message: "An account with that email already exists." };
    }
    throw error;
  }

  await createSession(created.id);
  await logAudit({
    action: "auth.setup_completed",
    summary: `Initial super administrator ${created.email} created`,
    entityType: "user",
    entityId: created.id,
    actor: {
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
    },
  });

  redirect("/dashboard");
}

export async function updateAccountAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Your session has expired. Sign in again." };

  const name = String(formData.get("name") ?? "").trim();
  const email = normaliseEmail(formData.get("email"));
  const currentPassword = String(formData.get("currentPassword") ?? "");

  if (!name) return { message: "Enter your full name." };
  if (name.length > 160) return { message: "Names must be 160 characters or fewer." };
  if (!validEmail(email)) return { message: "Enter a valid email address." };

  const emailChanged = email !== user.email.toLowerCase();
  if (emailChanged) {
    if (!currentPassword) {
      return { message: "Enter your current password to change your email address." };
    }
    const [row] = await sql<{ password_hash: string }[]>`
      select password_hash from users where id = ${user.id}
    `;
    if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
      return { message: "Your current password is incorrect." };
    }
  }

  try {
    await sql`
      update users
      set name = ${name}, email = ${email}, updated_at = now()
      where id = ${user.id}
    `;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return { message: "That email address belongs to another account." };
    }
    throw error;
  }

  await logAudit({
    action: "account.updated",
    summary: `${user.name} updated their account details`,
    entityType: "user",
    entityId: user.id,
    metadata: { emailChanged },
  });

  revalidatePath("/account");
  return { message: "Account details saved.", ok: true };
}

export async function changePasswordAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Your session has expired. Sign in again." };

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

  const [row] = await sql<{ password_hash: string }[]>`
    select password_hash from users where id = ${user.id}
  `;
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    return { message: "Your current password is incorrect." };
  }
  if (await verifyPassword(password, row.password_hash)) {
    return { message: "Choose a password you have not used for this account." };
  }

  const passwordHash = await hashPassword(password);
  await sql`
    update users
    set
      password_hash = ${passwordHash},
      password_changed_at = now(),
      updated_at = now()
    where id = ${user.id}
  `;
  await revokeOtherSessions(user.id, user.sessionId);
  await sql`
    update password_resets set used_at = now()
    where user_id = ${user.id} and used_at is null
  `;

  await logAudit({
    action: "auth.password_changed",
    summary: `${user.name} changed their password`,
    entityType: "user",
    entityId: user.id,
  });

  revalidatePath("/account");
  return {
    message: "Password changed. Other sessions have been signed out.",
    ok: true,
  };
}

export async function revokeOtherSessionsAction(): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Your session has expired. Sign in again." };

  await revokeOtherSessions(user.id, user.sessionId);
  await logAudit({
    action: "auth.sessions_revoked",
    summary: `${user.name} signed out their other sessions`,
    entityType: "user",
    entityId: user.id,
  });

  revalidatePath("/account");
  return { message: "Other sessions have been signed out.", ok: true };
}

export async function revokeSessionAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Your session has expired. Sign in again." };

  const sessionId = Number(formData.get("sessionId"));
  if (!Number.isInteger(sessionId) || sessionId < 1) {
    return { message: "Session not found." };
  }

  const [session] = await sql<{ id: number; user_id: number }[]>`
    select id, user_id from sessions
    where id = ${sessionId} and user_id = ${user.id} and revoked_at is null
  `;
  if (!session) return { message: "Session not found." };

  await revokeSession(sessionId, user.id);
  await logAudit({
    action: "auth.session_revoked",
    summary: `${user.name} signed out session #${sessionId}`,
    entityType: "session",
    entityId: sessionId,
  });

  if (sessionId === user.sessionId) {
    await clearSessionCookie();
    redirect("/login");
  }

  revalidatePath("/account");
  return { message: "Session signed out.", ok: true };
}

export async function signOutEverywhereAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await revokeAllSessions(user.id);
    await logAudit({
      action: "auth.signed_out_everywhere",
      summary: `${user.name} signed out of all sessions`,
      entityType: "user",
      entityId: user.id,
      actor: user,
    });
  }
  await clearSessionCookie();
  redirect("/login");
}

export async function createUserAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const current = await getCurrentUser();
  if (!current || current.role !== "super_admin") {
    return { message: "Only a super administrator can manage staff accounts." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = normaliseEmail(formData.get("email"));
  const roleText = String(formData.get("role") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!name) return { message: "Enter the staff member's full name." };
  if (name.length > 160) return { message: "Names must be 160 characters or fewer." };
  if (!validEmail(email)) return { message: "Enter a valid email address." };
  if (!isRole(roleText)) return { message: "Choose a valid role." };
  const role: Role = roleText;

  const policyError = validatePassword(password);
  if (policyError) return { message: policyError };
  if (password !== confirm) {
    return { message: "The two passwords do not match." };
  }

  const permissions = resolvePermissions(role, formData);

  const passwordHash = await hashPassword(password);

  let created: { id: number; name: string; email: string };
  try {
    [created] = await sql<{ id: number; name: string; email: string }[]>`
      insert into users (name, email, password_hash, role, permissions)
      values (
        ${name}, ${email}, ${passwordHash}, ${role},
        ${permissions}
      )
      returning id, name, email
    `;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return { message: "An account with that email already exists." };
    }
    throw error;
  }

  await logAudit({
    action: "user.created",
    summary: `${current.name} created ${role} account ${created.email}`,
    entityType: "user",
    entityId: created.id,
    metadata: { role, permissions },
  });

  revalidatePath("/users");
  return { message: `Account created for ${created.name}.`, ok: true };
}

type ManagedUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
};

async function activeSuperAdmins(exceptId?: number) {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count
    from users
    where role = 'super_admin'
      and is_active
      and id <> ${exceptId ?? 0}
  `;
  return row.count;
}

export async function updateUserAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const current = await getCurrentUser();
  if (!current || current.role !== "super_admin") {
    return { message: "Only a super administrator can manage staff accounts." };
  }

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const roleText = String(formData.get("role") ?? "");
  const isActive = formData.get("isActive") === "on";

  if (!Number.isInteger(id) || id < 1) return { message: "Account not found." };
  if (!name) return { message: "Enter the staff member's full name." };
  if (name.length > 160) return { message: "Names must be 160 characters or fewer." };
  if (!isRole(roleText)) return { message: "Choose a valid role." };

  const [target] = await sql<ManagedUser[]>`
    select id, name, email, role, is_active
    from users where id = ${id}
  `;
  if (!target) return { message: "Account not found." };

  const role: Role = roleText;
  const removingSuperAdmin =
    target.role === "super_admin" &&
    target.is_active &&
    (role !== "super_admin" || !isActive);

  if (id === current.id && (role !== "super_admin" || !isActive)) {
    return {
      message: "You cannot remove your own super administrator access.",
    };
  }
  if (removingSuperAdmin && (await activeSuperAdmins(id)) === 0) {
    return {
      message: "At least one active super administrator must remain.",
    };
  }

  const permissions = resolvePermissions(role, formData);

  await sql`
    update users
    set
      name = ${name},
      role = ${role},
      is_active = ${isActive},
      permissions = ${permissions},
      updated_at = now()
    where id = ${id}
  `;

  if (!isActive || target.role !== role) {
    await revokeAllSessions(id);
  }

  await logAudit({
    action: "user.updated",
    summary: `${current.name} updated account ${target.email}`,
    entityType: "user",
    entityId: id,
    metadata: {
      role,
      active: isActive,
      previousRole: target.role,
      permissions,
    },
  });

  revalidatePath("/users");
  return { message: `Account for ${name} saved.`, ok: true };
}

export async function issueUserResetLinkAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const current = await getCurrentUser();
  if (!current || current.role !== "super_admin") {
    return { message: "Only a super administrator can issue reset links." };
  }

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id < 1) return { message: "Account not found." };

  const [target] = await sql<ManagedUser[]>`
    select id, name, email, role, is_active
    from users where id = ${id}
  `;
  if (!target) return { message: "Account not found." };
  if (!target.is_active) {
    return { message: "Reactivate this account before issuing a reset link." };
  }

  await sql`
    update password_resets set used_at = now()
    where user_id = ${target.id} and used_at is null
  `;

  const token = newOpaqueToken();
  await sql`
    insert into password_resets (user_id, token_hash, expires_at)
    values (
      ${target.id}, ${hashSessionToken(token)}, now() + interval '1 hour'
    )
  `;

  const resetLink = `${appBaseUrl()}/reset-password?token=${token}`;
  const identity = await getLibraryIdentity();
  const delivery = await sendEmail({
    to: target.email,
    subject: `Your ${identity.name} password reset link`,
    text: [
      `Hello ${target.name},`,
      "",
      "A super administrator created a password reset link for your account.",
      `Open this link within one hour to choose a new password: ${resetLink}`,
      "",
      "If you were not expecting this, contact your super administrator.",
    ].join("\n"),
  });

  await logAudit({
    action: "user.reset_link_issued",
    summary: `${current.name} issued a password reset link for ${target.email}`,
    entityType: "user",
    entityId: target.id,
    metadata: { delivery: delivery.status },
  });

  return {
    message:
      delivery.status === "sent"
        ? `Reset link created and emailed to ${target.email}. It expires in one hour.`
        : `Reset link created. Email delivery was not available, so share this link securely. It expires in one hour.`,
    ok: true,
    resetLink,
  };
}
