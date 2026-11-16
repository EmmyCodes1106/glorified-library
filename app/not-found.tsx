import Link from "next/link";
import { FileQuestion } from "lucide-react";

export const metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
        <FileQuestion size={22} aria-hidden="true" />
      </span>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        404 · Page not found
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        We could not find that page
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted">
        The link may be out of date, or the book, member or record may have been
        removed.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/dashboard" className="btn btn-primary">
          Go to dashboard
        </Link>
        <Link href="/" className="btn btn-secondary">
          Browse books
        </Link>
      </div>
    </main>
  );
}
