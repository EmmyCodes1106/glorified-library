import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentMember } from "@/lib/member-auth/session";
import AuthShell from "@/app/auth-shell";
import { MemberLoginForm } from "@/components/member-auth-forms";

export const metadata = {
  title: { absolute: "Member sign in" },
};

// the page reads the member session cookie before rendering
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MemberLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  if (await getCurrentMember()) redirect("/member");

  const params = await searchParams;
  const nextParam = Array.isArray(params.next) ? params.next[0] : params.next;
  const next =
    nextParam && nextParam.startsWith("/member") && !nextParam.startsWith("//")
      ? nextParam
      : "";

  return (
    <AuthShell
      title="Member sign in"
      subtitle="View your loans, due dates, fines and membership details."
      homeHref="/member/login"
      homeLabel="Member portal"
    >
      <MemberLoginForm next={next} />
    </AuthShell>
  );
}
