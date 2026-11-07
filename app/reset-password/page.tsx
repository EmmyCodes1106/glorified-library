import Link from "next/link";
import { connection } from "next/server";
import sql from "@/db";
import { hashSessionToken } from "@/lib/auth/session";
import AuthShell from "../auth-shell";
import { ResetForm } from "../auth-forms";

export const metadata = {
  title: "Choose a new password",
};

// every request needs the session cookie before any data is read
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  const params = await searchParams;
  const token = Array.isArray(params.token)
    ? (params.token[0] ?? "")
    : (params.token ?? "");

  const valid = token
    ? (
        await sql`
          select pr.id
          from password_resets pr
          join users u on u.id = pr.user_id
          where pr.token_hash = ${hashSessionToken(token)}
            and pr.used_at is null
            and pr.expires_at > now()
            and u.is_active
          limit 1
        `
      ).length > 0
    : false;

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Reset links are single-use and expire one hour after they are created."
    >
      {valid ? (
        <ResetForm token={token} />
      ) : (
        <div className="grid gap-4 text-sm">
          <p className="rounded border border-red-300 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            This reset link is invalid or has expired.
          </p>
          <p className="text-gray-500">
            Request a new link from{" "}
            <Link
              href="/forgot-password"
              className="underline underline-offset-4"
            >
              the password reset page
            </Link>{" "}
            or ask a super administrator to issue one from the Staff page.
          </p>
        </div>
      )}
    </AuthShell>
  );
}
