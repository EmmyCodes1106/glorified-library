import { connection } from "next/server";
import AuthShell from "../auth-shell";
import { EmailVerificationForm } from "@/components/verify-email-forms";

export const metadata = {
  title: { absolute: "Confirm your email" },
};

// The account type is read from the query string per request.
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  const params = await searchParams;
  const type = Array.isArray(params.type) ? params.type[0] : params.type;
  const accountType = type === "member" ? "member" : "staff";

  return (
    <AuthShell
      title="Confirm your email"
      subtitle="Enter or resend your emailed verification code. No sign-in is needed."
      homeHref={accountType === "member" ? "/member/login" : "/login"}
      homeLabel={accountType === "member" ? "Member sign in" : "Staff sign in"}
    >
      <EmailVerificationForm
        key={accountType}
        accountType={accountType}
        allowAccountTypeChange
      />
    </AuthShell>
  );
}
