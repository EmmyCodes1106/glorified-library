import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import AuthShell from "../auth-shell";
import { RegisterForm } from "../auth-forms";

export const metadata = {
  title: "Request staff access",
};

// every request needs the session cookie before any data is read
export const instant = false;

export default async function RegisterPage() {
  await connection();

  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <AuthShell
      title="Request staff access"
      subtitle="Send a request to join the library team. A super administrator reviews every request before access is granted."
    >
      <div className="grid gap-4">
        <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
          Choose a password now. We will email a six-digit verification code. Once
          your address is confirmed, a super administrator reviews your request
          and assigns a role.
        </p>
        <RegisterForm />
      </div>
    </AuthShell>
  );
}
