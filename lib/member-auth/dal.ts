import "server-only";

import { redirect } from "next/navigation";
import { getCurrentMember, type SessionMember } from "./session";

export async function requireMember(): Promise<SessionMember> {
  const member = await getCurrentMember();
  if (!member) redirect("/member/login");
  return member;
}
