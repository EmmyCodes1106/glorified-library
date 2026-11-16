"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  RotateCcw,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import ThemeToggle from "./theme-toggle";
import LibraryLogo from "./library-logo";
import {
  NAV_GROUPS,
  PROFILE_ITEM,
  breadcrumbFor,
  initialsFor,
  isItemActive,
  pageTitleFor,
  type NavIcon,
} from "./nav-config";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  books: BookOpen,
  members: Users,
  borrowing: ArrowLeftRight,
  returns: RotateCcw,
  fines: ReceiptText,
  reports: BarChart3,
  notifications: Bell,
  audit: ScrollText,
  staff: ShieldCheck,
  settings: Settings,
  account: UserRound,
};

const SIDEBAR_KEY = "glorified-sidebar";
const SIDEBAR_EVENT = "glorified-sidebar-change";

function subscribeSidebar(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SIDEBAR_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SIDEBAR_EVENT, onChange);
  };
}

function readCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

export type ShellUser = {
  name: string;
  email: string;
  roleLabel: string;
};

export type ShellLibrary = {
  name: string;
  hoursLabel: string;
  contactEmail: string | null;
  noticeText: string | null;
  canSeeNotifications: boolean;
};

type Props = {
  user: ShellUser;
  library: ShellLibrary;
  allowedKeys: string[];
  children: ReactNode;
};

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={`flex items-center gap-3 rounded-lg outline-offset-4 ${
        collapsed ? "justify-center" : ""
      }`}
      title="Glorified Library Manager"
    >
      <LibraryLogo />
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold tracking-tight text-foreground">
            Glorified Library
          </span>
          <span className="block truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Manager
          </span>
        </span>
      )}
    </Link>
  );
}

function Navigation({
  pathname,
  allowedKeys,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  allowedKeys: string[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-5 px-3 py-2">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) =>
          allowedKeys.includes(item.key)
        );
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isItemActive(pathname, item.href);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={`nav-item ${
                        collapsed ? "justify-center px-0" : ""
                      }`}
                    >
                      <Icon size={18} strokeWidth={2} aria-hidden="true" />
                      <span className={collapsed ? "sr-only" : "truncate"}>
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFooter({
  library,
  collapsed,
}: {
  library: ShellLibrary;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <div className="flex justify-center border-t border-line px-3 py-4">
        <span
          className="h-2 w-2 rounded-full bg-success"
          title={`Open today: ${library.hoursLabel}`}
        />
      </div>
    );
  }
  return (
    <div className="border-t border-line px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        Today&apos;s hours
      </p>
      <p className="mt-1 text-xs font-medium text-foreground">
        {library.hoursLabel}
      </p>
      {library.contactEmail && (
        <a
          href={`mailto:${library.contactEmail}`}
          className="mt-1 block truncate text-xs text-muted hover:text-brand"
        >
          {library.contactEmail}
        </a>
      )}
      {library.noticeText && (
        <p className="mt-3 whitespace-pre-line rounded-md border border-warning/30 bg-warning-soft px-2.5 py-2 text-[11px] leading-relaxed text-warning">
          {library.noticeText}
        </p>
      )}
    </div>
  );
}

export default function AppShell({
  user,
  library,
  allowedKeys,
  children,
}: Props) {
  const pathname = usePathname() || "/";
  const collapsed = useSyncExternalStore(subscribeSidebar, readCollapsed, () => false);
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const [profilePath, setProfilePath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const profileOpen = profilePath === pathname;
  const profileRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerWasOpen = useRef(false);

  useEffect(() => {
    if (!profileOpen) return;
    function onPointer(event: PointerEvent) {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfilePath(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setProfilePath(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (drawerOpen) {
      drawerWasOpen.current = true;
      return;
    }
    if (drawerWasOpen.current) {
      drawerWasOpen.current = false;
      menuButtonRef.current?.focus();
    }
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerPath(null);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  function toggleCollapsed() {
    try {
      window.localStorage.setItem(
        SIDEBAR_KEY,
        collapsed ? "expanded" : "collapsed"
      );
    } catch {
      // the toggle still works when storage is unavailable
    }
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }

  const title = pageTitleFor(pathname);
  const breadcrumb = breadcrumbFor(pathname);
  const searchAction = pathname.startsWith("/members") ? "/members" : "/";

  return (
    <div className="min-h-dvh bg-app">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:text-on-brand"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-sidebar transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[76px]" : "w-[272px]"
        }`}
      >
        <div
          className={`flex h-16 shrink-0 items-center border-b border-line ${
            collapsed ? "justify-center px-2" : "justify-between px-4"
          }`}
        >
          <Brand collapsed={collapsed} />
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="btn btn-ghost btn-icon !min-h-8 !w-8"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={17} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Navigation
            pathname={pathname}
            allowedKeys={allowedKeys}
            collapsed={collapsed}
          />
        </div>

        <SidebarFooter library={library} collapsed={collapsed} />

        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex h-10 items-center justify-center border-t border-line text-muted hover:bg-surface-2 hover:text-foreground"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={17} aria-hidden="true" />
          </button>
        )}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? "" : "hidden"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <button
          type="button"
          className="absolute inset-0 h-full w-full bg-slate-950/50"
          aria-label="Close navigation"
          onClick={() => setDrawerPath(null)}
        />
        <div
          ref={drawerRef}
          className="relative flex h-full w-[286px] flex-col border-r border-line bg-sidebar shadow-pop"
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
            <Brand />
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setDrawerPath(null)}
              className="btn btn-ghost btn-icon"
              aria-label="Close navigation"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Navigation
              pathname={pathname}
              allowedKeys={allowedKeys}
              collapsed={false}
              onNavigate={() => setDrawerPath(null)}
            />
          </div>
          <SidebarFooter library={library} collapsed={false} />
        </div>
      </div>

      <div
        className={`flex min-h-dvh flex-col transition-[padding] duration-200 ${
          collapsed ? "lg:pl-[76px]" : "lg:pl-[272px]"
        }`}
      >
        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setDrawerPath(pathname)}
              className="btn btn-ghost btn-icon lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={19} aria-hidden="true" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="hidden text-[11px] font-medium text-muted sm:block">
                {breadcrumb.join(" / ")}
              </p>
              <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
                {title}
              </h1>
            </div>

            <form
              action={searchAction}
              method="get"
              role="search"
              className="relative hidden w-64 xl:block"
            >
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                name="q"
                placeholder="Search catalogue"
                aria-label="Search catalogue"
                className="field field-sm w-full pl-9"
              />
            </form>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <ThemeToggle />

              {library.canSeeNotifications && (
                <Link
                  href="/notifications"
                  className="btn btn-ghost btn-icon"
                  aria-label="Notifications"
                  title="Notifications"
                >
                  <Bell size={18} aria-hidden="true" />
                </Link>
              )}

              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setProfilePath(profileOpen ? null : pathname)}
                  aria-expanded={profileOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 rounded-lg p-1 pr-1.5 transition-colors hover:bg-surface-2"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand ring-1 ring-brand-soft-border">
                    {initialsFor(user.name)}
                  </span>
                  <span className="hidden text-left leading-tight md:block">
                    <span className="block max-w-[140px] truncate text-xs font-semibold text-foreground">
                      {user.name}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {user.roleLabel}
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className="hidden text-muted md:block"
                  />
                </button>

                {profileOpen && (
                  <div
                    role="menu"
                    aria-label="Account menu"
                    className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
                  >
                    <div className="border-b border-line px-4 py-3">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {user.name}
                      </p>
                      <p className="truncate text-xs text-muted">{user.email}</p>
                      <p className="mt-1 text-[11px] font-medium text-brand">
                        {user.roleLabel}
                      </p>
                    </div>
                    <div className="p-1.5">
                      <Link
                        href={PROFILE_ITEM.href}
                        role="menuitem"
                        onClick={() => setProfilePath(null)}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-strong hover:bg-surface-2 hover:text-foreground"
                      >
                        <UserRound size={16} aria-hidden="true" />
                        {PROFILE_ITEM.label}
                      </Link>
                      <form action={logoutAction}>
                        <button
                          type="submit"
                          role="menuitem"
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted-strong hover:bg-danger-soft hover:text-danger"
                        >
                          <LogOut size={16} aria-hidden="true" />
                          Sign out
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-line px-4 py-2 sm:px-6 xl:hidden">
            <form
              action={searchAction}
              method="get"
              role="search"
              className="relative"
            >
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                name="q"
                placeholder="Search catalogue"
                aria-label="Search catalogue"
                className="field field-sm w-full pl-9"
              />
            </form>
          </div>
        </header>

        <main
          id="main-content"
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
