import Link from "next/link";
import { connection } from "next/server";
import { ShieldX } from "lucide-react";
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
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-danger-soft text-danger">
        <ShieldX size={22} aria-hidden="true" />
      </span>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        403 · Access denied
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        You do not have access to this page
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted">
        Your role does not include this permission. If you believe you should
        have access, contact a super administrator.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {user ? (
          <>
            <Link href="/dashboard" className="btn btn-primary">
              Go to dashboard
            </Link>
            <Link href="/account" className="btn btn-secondary">
              Your account
            </Link>
          </>
        ) : (
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
        )}
      </div>
    </main>
  );
}
