import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { emailProviderStatus } from "@/lib/email";
import AuthShell from "../auth-shell";
import { ForgotForm } from "../auth-forms";

export const metadata = {
  title: "Reset password",
};

// every request needs the session cookie before any data is read
export const instant = false;

export default async function ForgotPasswordPage() {
  await connection();

  if (await getCurrentUser()) redirect("/account");

  const provider = emailProviderStatus();

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will email a one-time reset link if the address belongs to an active account."
    >
      <div className="grid gap-4">
        <ForgotForm />
        {!provider.configured && (
          <p className="rounded border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">
            Email delivery is not configured on this server. If you need a new
            password, ask a super administrator to issue a reset link from the
            Staff page.
          </p>
        )}
      </div>
    </AuthShell>
  );
}
