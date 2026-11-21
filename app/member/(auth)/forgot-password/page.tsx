import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentMember } from "@/lib/member-auth/session";
import AuthShell from "@/app/auth-shell";
import { MemberForgotForm } from "@/components/member-auth-forms";

export const metadata = {
  title: { absolute: "Reset your password" },
};

// the page reads the member session cookie before rendering
export const instant = false;

export default async function MemberForgotPasswordPage() {
  await connection();

  if (await getCurrentMember()) redirect("/member");

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will email a six-digit code to the address on your member account. Enter it with a new password — no staff approval needed."
      homeHref="/member/login"
      homeLabel="Member portal"
    >
      <MemberForgotForm />
    </AuthShell>
  );
}
