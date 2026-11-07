import Link from "next/link";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = {
  title: "Access denied",
};

// every request needs the session cookie before any data is read
export const instant = false;

export default async function ForbiddenPage() {
  await connection();
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        403 · Access denied
      </p>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
        You do not have access to this page
      </h1>
      <p className="mt-3 text-sm text-gray-500">
        Your role does not include this permission. If you believe you should
        have access, contact a super administrator.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm">
        {user ? (
          <>
            <Link href="/dashboard" className="underline underline-offset-4">
              Go to dashboard
            </Link>
            <Link href="/account" className="underline underline-offset-4">
              Your account
            </Link>
          </>
        ) : (
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        )}
      </div>
    </main>
  );
}
