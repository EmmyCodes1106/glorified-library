import Link from "next/link";
import type { ReactNode } from "react";
import LibraryLogo from "@/components/library-logo";
import ThemeToggle from "@/components/theme-toggle";
import { getLibraryIdentity, todayHoursLabel } from "@/lib/settings";

export default async function AuthShell({
  title,
  subtitle,
  children,
  homeHref = "/",
  homeLabel,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  homeHref?: string;
  homeLabel?: string;
}) {
  const identity = await getLibraryIdentity();
  const hours = todayHoursLabel(identity.openingHours);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <LibraryLogo className="mx-auto mb-3 h-20 w-40" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {identity.name}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>

        <div className="card p-5 sm:p-6">{children}</div>

        <div className="mt-4 space-y-1 text-center text-xs text-muted">
          <p>
            Open today: <span className="text-muted-strong">{hours}</span>
          </p>
          {(identity.contactEmail || identity.contactPhone) && (
            <p className="flex flex-wrap items-center justify-center gap-x-2">
              {identity.contactEmail && (
                <a
                  href={`mailto:${identity.contactEmail}`}
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  {identity.contactEmail}
                </a>
              )}
              {identity.contactPhone && <span>{identity.contactPhone}</span>}
            </p>
          )}
        </div>

        {identity.noticeText && (
          <p className="mt-3 whitespace-pre-line rounded-lg border border-warning/25 bg-warning-soft p-3 text-center text-xs text-warning">
            {identity.noticeText}
          </p>
        )}

        <p className="mt-6 text-center text-xs text-muted">
          <Link
            href={homeHref}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {homeLabel ?? `${identity.name} Manager`}
          </Link>
        </p>
      </div>
    </main>
  );
}
