"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import "./globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-danger-soft text-danger">
            <TriangleAlert size={22} aria-hidden="true" />
          </span>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Application error
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            The application could not start
          </h1>
          <p className="mt-3 max-w-sm text-sm text-muted">
            Reload the page to try again. If the problem continues, contact a
            super administrator.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="btn btn-primary mt-6"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
