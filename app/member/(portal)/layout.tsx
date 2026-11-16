import type { Metadata } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { requireMember } from "@/lib/member-auth/dal";
import { getLibraryIdentity, todayHoursLabel } from "@/lib/settings";
import MemberShell from "@/components/member-shell";

export const instant = false;

export const metadata: Metadata = {
  title: {
    default: "Member portal",
    template: "%s · Member portal",
  },
};

export default async function MemberPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();
  const member = await requireMember();
  const identity = await getLibraryIdentity();

  return (
    <MemberShell
      member={{
        name: member.name,
        email: member.email,
        memberCode: member.memberCode,
        status: member.status,
      }}
      library={{
        name: identity.name,
        hoursLabel: todayHoursLabel(identity.openingHours),
        contactEmail: identity.contactEmail,
        noticeText: identity.noticeText,
      }}
    >
      {children}
    </MemberShell>
  );
}
