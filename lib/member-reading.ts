import "server-only";

import { getCurrentMember, type SessionMember } from "@/lib/member-auth/session";
import { getEbookAccess, type EbookAccess } from "@/lib/ebooks";

/** Responses must never be cached: access depends on the live loan. */
export const READING_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};

export type ReadingAccess =
  | { ok: true; member: SessionMember; access: EbookAccess }
  | { ok: false; status: number; error: string };

export function parseId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function authoriseReading(
  bookId: number | null
): Promise<ReadingAccess> {
  const member = await getCurrentMember();
  if (!member) {
    return { ok: false, status: 401, error: "Sign in to read online." };
  }
  if (bookId === null) {
    return { ok: false, status: 404, error: "This title could not be found." };
  }

  // One query covers it: open, unreturned loan + active membership + file.
  const access = await getEbookAccess(member.id, bookId);
  if (!access) {
    return {
      ok: false,
      status: 403,
      error:
        "Reading online needs an open loan for this title and an active membership.",
    };
  }

  return { ok: true, member, access };
}
