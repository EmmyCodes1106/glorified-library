"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : undefined;

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-danger-soft text-danger">
        <TriangleAlert size={22} aria-hidden="true" />
      </span>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        Something went wrong
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        This page could not be loaded
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted">
        The server ran into an unexpected error. Try again, or go back to the
        dashboard.
      </p>
      {digest && (
        <p className="mt-2 text-xs text-muted">
          Reference:{" "}
          <code className="break-all rounded bg-surface-2 px-1.5 py-0.5">
            {digest}
          </code>
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="btn btn-primary"
        >
          Try again
        </button>
        <Link href="/dashboard" className="btn btn-secondary">
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
