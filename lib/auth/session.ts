import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import sql from "@/db";
import {
  isRole,
  normalizePermissions,
  type Permission,
  type Role,
} from "./permissions";

export const SESSION_COOKIE = "glorified_session";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  sessionId: number;
  sessionExpiresAt: string;
  lastLoginAt: string | null;
};

export type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export async function requestContext(): Promise<RequestContext> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() ||
    store.get("x-real-ip")?.trim() ||
    null;
  const userAgent = store.get("user-agent")?.slice(0, 500) ?? null;
  return { ipAddress, userAgent };
}

export function getSessionToken() {
  return cookies()
    .then((store) => store.get(SESSION_COOKIE)?.value ?? null);
}

export async function createSession(userId: number) {
  const token = newSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  const context = await requestContext();

  const [session] = await sql`
    insert into sessions (
      user_id, token_hash, user_agent, ip_address, expires_at
    )
    values (
      ${userId}, ${tokenHash}, ${context.userAgent}, ${context.ipAddress},
      ${expiresAt}
    )
    returning id
  `;

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return { sessionId: session.id as number, token, expiresAt };
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

type SessionRow = {
  session_id: number;
  session_expires_at: string;
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  is_active: boolean;
  last_login_at: string | null;
};

async function loadSessionUser(): Promise<SessionUser | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const [row] = await sql<SessionRow[]>`
    select
      s.id as session_id,
      to_char(s.expires_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as session_expires_at,
      u.id,
      u.name,
      u.email,
      u.role,
      u.permissions,
      u.is_active,
      to_char(u.last_login_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as last_login_at
    from sessions s
    join users u on u.id = s.user_id
    where s.token_hash = ${tokenHash}
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1
  `;

  if (!row) return null;

  if (!row.is_active || !isRole(row.role)) {
    await sql`
      update sessions set revoked_at = now()
      where id = ${row.session_id} and revoked_at is null
    `;
    return null;
  }

  await sql`
    update sessions set last_seen_at = now()
    where id = ${row.session_id}
      and last_seen_at < now() - interval '5 minutes'
  `;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    permissions: normalizePermissions(row.permissions),
    sessionId: row.session_id,
    sessionExpiresAt: row.session_expires_at,
    lastLoginAt: row.last_login_at,
  };
}

/** Deduplicated within a single server render. */
export const getCurrentUser = cache(loadSessionUser);

export async function revokeSession(sessionId: number, userId: number) {
  await sql`
    update sessions set revoked_at = now()
    where id = ${sessionId} and user_id = ${userId} and revoked_at is null
  `;
}

export async function revokeOtherSessions(userId: number, keepSessionId: number) {
  await sql`
    update sessions set revoked_at = now()
    where user_id = ${userId}
      and id <> ${keepSessionId}
      and revoked_at is null
  `;
}

export async function revokeAllSessions(userId: number) {
  await sql`
    update sessions set revoked_at = now()
    where user_id = ${userId} and revoked_at is null
  `;
}

export async function revokeCurrentSession() {
  const user = await getCurrentUser();
  if (user) await revokeSession(user.sessionId, user.id);
  await clearSessionCookie();
}
