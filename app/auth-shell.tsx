import Link from "next/link";
import type { ReactNode } from "react";
import { getLibraryIdentity, todayHoursLabel } from "@/lib/settings";

export default async function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const identity = await getLibraryIdentity();
  const hours = todayHoursLabel(identity.openingHours);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          {identity.logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={identity.logoDataUrl}
              alt=""
              className="mx-auto mb-3 h-12 w-auto max-w-[160px] object-contain"
            />
          )}
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            {identity.name}
          </p>
          <h1 className="mt-1 text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="rounded-lg border p-5 sm:p-6">{children}</div>

        <div className="mt-4 space-y-1 text-center text-xs text-gray-500">
          <p>Open today: {hours}</p>
          {(identity.contactEmail || identity.contactPhone) && (
            <p className="flex flex-wrap items-center justify-center gap-x-2">
              {identity.contactEmail && (
                <a
                  href={`mailto:${identity.contactEmail}`}
                  className="underline underline-offset-4"
                >
                  {identity.contactEmail}
                </a>
              )}
              {identity.contactPhone && <span>{identity.contactPhone}</span>}
            </p>
          )}
        </div>

        {identity.noticeText && (
          <p className="mt-3 whitespace-pre-line rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-center text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
            {identity.noticeText}
          </p>
        )}

        <p className="mt-6 text-center text-xs text-gray-500">
          <Link href="/" className="underline underline-offset-4">
            {identity.name} Manager
          </Link>
        </p>
      </div>
    </main>
  );
}
