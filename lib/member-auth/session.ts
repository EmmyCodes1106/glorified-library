import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import sql from "@/db";
import { requestContext } from "@/lib/auth/session";

export const MEMBER_SESSION_COOKIE = "glorified_member_session";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export type MemberStatus = "active" | "suspended" | "expired";

export type SessionMember = {
  id: number;
  memberCode: string;
  name: string;
  email: string | null;
  loanLimit: number;
  status: MemberStatus;
  sessionId: number;
  sessionExpiresAt: string;
  lastLoginAt: string | null;
};

export function hashMemberSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export async function getMemberSessionToken() {
  return cookies()
    .then((store) => store.get(MEMBER_SESSION_COOKIE)?.value ?? null);
}

export async function createMemberSession(memberId: number) {
  const token = newSessionToken();
  const tokenHash = hashMemberSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  const context = await requestContext();

  const [session] = await sql`
    insert into member_sessions (
      member_id, token_hash, user_agent, ip_address, expires_at
    )
    values (
      ${memberId}, ${tokenHash}, ${context.userAgent}, ${context.ipAddress},
      ${expiresAt}
    )
    returning id
  `;

  const store = await cookies();
  store.set(MEMBER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return { sessionId: session.id as number, token, expiresAt };
}

export async function clearMemberSessionCookie() {
  const store = await cookies();
  store.delete(MEMBER_SESSION_COOKIE);
}

type MemberSessionRow = {
  session_id: number;
  session_expires_at: string;
  id: number;
  member_code: string;
  name: string;
  email: string | null;
  loan_limit: number;
  status: string;
  last_login_at: string | null;
};

async function loadSessionMember(): Promise<SessionMember | null> {
  const token = await getMemberSessionToken();
  if (!token) return null;

  const tokenHash = hashMemberSessionToken(token);
  const [row] = await sql<MemberSessionRow[]>`
    select
      s.id as session_id,
      to_char(s.expires_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as session_expires_at,
      m.id,
      m.member_code,
      m.name,
      m.email,
      m.loan_limit,
      case
        when m.status = 'active'
          and m.membership_expires_on is not null
          and m.membership_expires_on < current_date
        then 'expired'
        else m.status
      end as status,
      to_char(m.portal_last_login_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as last_login_at
    from member_sessions s
    join members m on m.id = s.member_id
    where s.token_hash = ${tokenHash}
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1
  `;

  if (!row) return null;

  await sql`
    update member_sessions set last_seen_at = now()
    where id = ${row.session_id}
      and last_seen_at < now() - interval '5 minutes'
  `;

  return {
    id: row.id,
    memberCode: row.member_code,
    name: row.name,
    email: row.email,
    loanLimit: row.loan_limit,
    status: row.status as MemberStatus,
    sessionId: row.session_id,
    sessionExpiresAt: row.session_expires_at,
    lastLoginAt: row.last_login_at,
  };
}

/** Deduplicated within a single server render. */
export const getCurrentMember = cache(loadSessionMember);

export async function revokeMemberSession(sessionId: number, memberId: number) {
  await sql`
    update member_sessions set revoked_at = now()
    where id = ${sessionId} and member_id = ${memberId} and revoked_at is null
  `;
}

export async function revokeOtherMemberSessions(
  memberId: number,
  keepSessionId: number
) {
  await sql`
    update member_sessions set revoked_at = now()
    where member_id = ${memberId}
      and id <> ${keepSessionId}
      and revoked_at is null
  `;
}

export async function revokeAllMemberSessions(memberId: number) {
  await sql`
    update member_sessions set revoked_at = now()
    where member_id = ${memberId} and revoked_at is null
  `;
}

export async function revokeCurrentMemberSession() {
  const member = await getCurrentMember();
  if (member) await revokeMemberSession(member.sessionId, member.id);
  await clearMemberSessionCookie();
}
