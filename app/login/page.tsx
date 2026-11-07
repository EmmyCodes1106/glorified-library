import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import sql from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import AuthShell from "../auth-shell";
import { LoginForm } from "../auth-forms";

export const metadata = {
  title: "Sign in",
};

// every request needs the session cookie before any data is read
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  if (await getCurrentUser()) redirect("/dashboard");

  const params = await searchParams;
  const reset = params.reset === "1";
  const nextParam = Array.isArray(params.next) ? params.next[0] : params.next;
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "";

  const [counts] = await sql<{ count: number }[]>`
    select count(*)::int as count from users
  `;

  return (
    <AuthShell
      title="Sign in"
      subtitle="Staff access to the library catalogue, members and circulation."
    >
      <LoginForm reset={reset} next={next} />
      {counts.count === 0 && (
        <p className="mt-4 border-t pt-4 text-sm text-gray-500">
          First time here?{" "}
          <Link href="/setup" className="underline underline-offset-4">
            Create the first super administrator
          </Link>
          .
        </p>
      )}
    </AuthShell>
  );
}
