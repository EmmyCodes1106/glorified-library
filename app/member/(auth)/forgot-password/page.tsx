import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentMember } from "@/lib/member-auth/session";
import AuthShell from "@/app/auth-shell";
import { MemberForgotForm } from "@/components/member-auth-forms";

export const metadata = {
  title: { absolute: "Request a password change" },
};

// the page reads the member session cookie before rendering
export const instant = false;

export default async function MemberForgotPasswordPage() {
  await connection();

  if (await getCurrentMember()) redirect("/member");

  return (
    <AuthShell
      title="Request a password change"
      subtitle="Send a request to library staff. They will set a temporary password for you."
      homeHref="/member/login"
      homeLabel="Member portal"
    >
      <MemberForgotForm />
    </AuthShell>
  );
}
