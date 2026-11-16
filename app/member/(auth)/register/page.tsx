import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentMember } from "@/lib/member-auth/session";
import AuthShell from "@/app/auth-shell";
import { MemberRegisterForm } from "@/components/member-auth-forms";

export const metadata = {
  title: { absolute: "Create a member account" },
};

// the page reads the member session cookie before rendering
export const instant = false;

export default async function MemberRegisterPage() {
  await connection();

  if (await getCurrentMember()) redirect("/member");

  return (
    <AuthShell
      title="Create a member account"
      subtitle="Access your own borrowing record, due dates and fines."
      homeHref="/member/login"
      homeLabel="Member portal"
    >
      <MemberRegisterForm />
    </AuthShell>
  );
}
