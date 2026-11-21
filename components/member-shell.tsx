"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  History,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { memberLogoutAction } from "@/app/member-actions";
import LibraryLogo from "./library-logo";
import ThemeToggle from "./theme-toggle";

const NAV_ITEMS = [
  { href: "/member", label: "Overview", icon: LayoutDashboard, exact: true },
  {
    href: "/member/catalogue",
    label: "Catalogue",
    icon: LibraryBig,
    exact: false,
  },
  { href: "/member/loans", label: "My loans", icon: BookOpen, exact: false },
  { href: "/member/history", label: "History", icon: History, exact: false },
  { href: "/member/fines", label: "Fines", icon: ReceiptText, exact: false },
  { href: "/member/profile", label: "Profile", icon: UserRound, exact: false },
];

export type MemberShellMember = {
  name: string;
  email: string | null;
  memberCode: string;
  status: "active" | "suspended" | "expired";
};

export type MemberShellLibrary = {
  name: string;
  hoursLabel: string;
  contactEmail: string | null;
  noticeText: string | null;
};

function isActive(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function MemberNavigation({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Member portal navigation" className="flex gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-brand-soft text-brand"
                : "text-muted-strong hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Icon size={16} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function MemberShell({
  member,
  library,
  children,
}: {
  member: MemberShellMember;
  library: MemberShellLibrary;
  children: ReactNode;
}) {
  const pathname = usePathname() || "/member";

  return (
    <div className="min-h-dvh bg-app">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:text-on-brand"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/member"
            className="flex min-w-0 items-center gap-2.5 rounded-lg outline-offset-4"
          >
            <LibraryLogo />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight text-foreground">
                {library.name}
              </span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Member portal
              </span>
            </span>
          </Link>

          <div className="ml-4 hidden xl:block">
            <MemberNavigation pathname={pathname} />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden xl:block">
              <ThemeToggle />
            </div>
            <div className="hidden text-right leading-tight sm:block">
              <p className="max-w-[180px] truncate text-xs font-semibold text-foreground">
                {member.name}
              </p>
              <p className="text-[11px] text-muted">{member.memberCode}</p>
            </div>
            <form action={memberLogoutAction}>
              <button className="btn btn-sm btn-secondary">
                <LogOut size={14} aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>

        <div className="border-t border-line px-2 py-1.5 xl:hidden">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="px-2">
                <MemberNavigation pathname={pathname} />
              </div>
            </div>
            <div className="shrink-0 pr-1">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {member.status !== "active" && (
        <div
          role="alert"
          className="border-b border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          <div className="mx-auto max-w-[1440px]">
            {member.status === "suspended"
              ? "Your membership is suspended, so new loans cannot be issued. Contact the library to reactivate it."
              : "Your membership has expired. Contact the library to renew it before borrowing again."}
          </div>
        </div>
      )}

      <main
        id="main-content"
        className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
        {children}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-[1440px] space-y-1 px-4 py-5 text-xs text-muted sm:px-6 lg:px-8">
          <p>
            Open today:{" "}
            <span className="font-medium text-muted-strong">
              {library.hoursLabel}
            </span>
          </p>
          {library.contactEmail && (
            <p>
              Questions?{" "}
              <a
                href={`mailto:${library.contactEmail}`}
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                {library.contactEmail}
              </a>
            </p>
          )}
          {library.noticeText && (
            <p className="whitespace-pre-line rounded-lg border border-warning/25 bg-warning-soft p-2.5 text-warning">
              {library.noticeText}
            </p>
          )}
          <p className="pt-1">
            Library staff?{" "}
            <Link
              href="/login"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Staff workspace
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
