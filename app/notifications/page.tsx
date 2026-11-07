import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import AppNav from "../app-nav";
import LibraryBrand from "../library-brand";
import { emailProviderStatus } from "@/lib/email";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  loadNotificationSettings,
  type NotificationType,
} from "@/lib/notifications";
import NotificationSettingsForm from "./notification-settings-form";
import RunNotificationsForm from "./run-notifications-form";

export const metadata = {
  title: "Notifications",
};

// every request needs the session cookie before any data is read
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type NotificationRow = {
  id: number;
  type: NotificationType;
  audience: "member" | "admin";
  recipient: string | null;
  subject: string;
  body: string;
  member_id: number | null;
  loan_id: number | null;
  email_status: "pending" | "sent" | "skipped" | "failed";
  email_error: string | null;
  created: string;
  sent: string | null;
};

type NotificationStats = {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
};

type TypeCount = { type: NotificationType; count: number };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function maskEmail(value: string | null) {
  if (!value) return "—";
  const at = value.indexOf("@");
  if (at <= 0) return value;
  const local = value.slice(0, at);
  const domain = value.slice(at);
  return `${local.slice(0, 1)}${"*".repeat(Math.max(2, local.length - 1))}${domain}`;
}

function StatCard({
  label,
  value,
  hint,
  dot,
  valueClass = "",
}: {
  label: string;
  value: number;
  hint: string;
  dot: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </div>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}

const TYPE_CLASSES: Record<NotificationType, string> = {
  borrow_confirmation:
    "border-green-300 text-green-700 dark:border-green-800 dark:text-green-400",
  return_confirmation:
    "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400",
  due_reminder:
    "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400",
  overdue_notice:
    "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400",
  suspension_notice:
    "border-purple-300 text-purple-700 dark:border-purple-800 dark:text-purple-400",
  admin_overdue_alert:
    "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400",
};

function TypeBadge({ type }: { type: NotificationType }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${TYPE_CLASSES[type]}`}
    >
      {NOTIFICATION_TYPE_LABELS[type]}
    </span>
  );
}

const STATUS_CLASSES: Record<NotificationRow["email_status"], string> = {
  sent: "border-green-300 text-green-700 dark:border-green-800 dark:text-green-400",
  failed: "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400",
  skipped:
    "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400",
  pending:
    "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400",
};

const STATUS_LABELS: Record<NotificationRow["email_status"], string> = {
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
  pending: "Pending",
};

function EmailBadge({ row }: { row: NotificationRow }) {
  return (
    <div>
      <span
        className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_CLASSES[row.email_status]}`}
      >
        {STATUS_LABELS[row.email_status]}
      </span>
      {row.sent && (
        <p className="mt-1 text-[11px] text-gray-500">Sent {row.sent}</p>
      )}
      {row.email_error && (
        <p
          className={`mt-1 max-w-[220px] break-words text-[11px] ${
            row.email_status === "failed"
              ? "text-red-600 dark:text-red-400"
              : "text-gray-500"
          }`}
        >
          {row.email_error}
        </p>
      )}
    </div>
  );
}

function MessageDetails({ row }: { row: NotificationRow }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-gray-500">
        View message
      </summary>
      <pre className="mt-2 max-w-xl whitespace-pre-wrap break-words font-sans text-xs text-gray-600 dark:text-gray-300">
        {row.body}
      </pre>
    </details>
  );
}

function NotificationLog({ rows }: { rows: NotificationRow[] }) {
  return (
    <>
      <div className="mt-4 hidden overflow-hidden rounded-lg border md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900">
              <tr>
                <th scope="col" className="p-3 font-medium">
                  When
                </th>
                <th scope="col" className="p-3 font-medium">
                  Type
                </th>
                <th scope="col" className="p-3 font-medium">
                  Recipient
                </th>
                <th scope="col" className="p-3 font-medium">
                  Notification
                </th>
                <th scope="col" className="p-3 font-medium">
                  Email
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="p-3 text-xs">
                    <p>{row.created}</p>
                    <p className="text-gray-500">#{row.id}</p>
                  </td>
                  <td className="p-3">
                    <TypeBadge type={row.type} />
                  </td>
                  <td className="p-3 text-xs">
                    <p>{maskEmail(row.recipient)}</p>
                    <p className="capitalize text-gray-500">{row.audience}</p>
                  </td>
                  <td className="p-3">
                    <p className="font-medium">{row.subject}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {row.member_id && (
                        <Link
                          href={`/members/${row.member_id}`}
                          className="underline underline-offset-4"
                        >
                          Member
                        </Link>
                      )}
                      {row.member_id && row.loan_id && " · "}
                      {row.loan_id && (
                        <Link
                          href={`/circulation?status=all&q=${row.loan_id}`}
                          className="underline underline-offset-4"
                        >
                          Loan #{row.loan_id}
                        </Link>
                      )}
                    </p>
                    <MessageDetails row={row} />
                  </td>
                  <td className="p-3">
                    <EmailBadge row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{row.subject}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {row.created} · #{row.id}
                </p>
              </div>
              <TypeBadge type={row.type} />
            </div>
            <p className="mt-2 text-xs">
              <span className="text-gray-500">To {maskEmail(row.recipient)}</span>
              <span className="text-gray-500"> · {row.audience}</span>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {row.member_id && (
                <Link
                  href={`/members/${row.member_id}`}
                  className="underline underline-offset-4"
                >
                  Member
                </Link>
              )}
              {row.member_id && row.loan_id && " · "}
              {row.loan_id && (
                <Link
                  href={`/circulation?status=all&q=${row.loan_id}`}
                  className="underline underline-offset-4"
                >
                  Loan #{row.loan_id}
                </Link>
              )}
            </p>
            <div className="mt-2">
              <EmailBadge row={row} />
            </div>
            <MessageDetails row={row} />
          </li>
        ))}
      </ul>
    </>
  );
}

async function NotificationsView({
  searchParams,
  canManage,
}: {
  searchParams: SearchParams;
  canManage: boolean;
}) {
  const params = await searchParams;
  const typeText = first(params.type);
  const selected =
    NOTIFICATION_TYPES.find((value) => value === typeText) ?? null;

  const [settings, statsRows, typeCounts, rows] = await Promise.all([
    loadNotificationSettings(),
    sql<NotificationStats[]>`
      select
        count(*)::int as total,
        count(*) filter (where email_status = 'sent')::int as sent,
        count(*) filter (where email_status = 'failed')::int as failed,
        count(*) filter (where email_status = 'skipped')::int as skipped,
        count(*) filter (where email_status = 'pending')::int as pending
      from notifications
    `,
    sql<TypeCount[]>`
      select type, count(*)::int as count
      from notifications
      group by type
    `,
    sql<NotificationRow[]>`
      select
        id,
        type,
        audience,
        recipient,
        subject,
        body,
        member_id,
        loan_id,
        email_status,
        email_error,
        to_char(created_at, 'DD Mon YYYY HH24:MI') as created,
        to_char(sent_at, 'DD Mon YYYY HH24:MI') as sent
      from notifications
      where (${selected ?? null}::text is null or type = ${selected ?? null})
      order by created_at desc, id desc
      limit 200
    `,
  ]);

  const stats = statsRows[0] ?? {
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
  };
  const provider = emailProviderStatus();
  const counts = new Map(typeCounts.map((row) => [row.type, row.count]));

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Notifications"
          value={stats.total}
          hint="Recorded events"
          dot="bg-gray-400"
        />
        <StatCard
          label="Emailed"
          value={stats.sent}
          hint="Delivered through Resend"
          dot="bg-green-600"
          valueClass={stats.sent > 0 ? "text-green-600" : ""}
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          hint="Delivery errors to review"
          dot="bg-red-500"
          valueClass={stats.failed > 0 ? "text-red-600" : ""}
        />
        <StatCard
          label="Skipped"
          value={stats.skipped}
          hint="No provider, recipient or email disabled"
          dot="bg-amber-500"
        />
      </div>

      {provider.configured ? (
        <p className="mt-4 rounded-lg border border-green-200 bg-green-50/40 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/20 dark:text-green-400">
          Email delivery is configured through Resend.
        </p>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-400">
          <p className="font-medium">Email delivery is not configured.</p>
          <p className="mt-1">
            Set{" "}
            {provider.missing.map((name, index) => (
              <span key={name}>
                {index > 0 && " and "}
                <code className="rounded bg-black/5 px-1 py-0.5 text-xs dark:bg-white/10">
                  {name}
                </code>
              </span>
            ))}{" "}
            in the server environment to send real email through Resend.
            Notifications are still recorded and marked skipped — delivery is
            never simulated.
          </p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {canManage && (
          <NotificationSettingsForm
            emailEnabled={settings.email_enabled}
            borrowingConfirmation={settings.borrowing_confirmation}
            returnConfirmation={settings.return_confirmation}
            dueReminders={settings.due_reminders}
            overdueNotices={settings.overdue_notices}
            suspensionNotices={settings.suspension_notices}
            adminOverdueAlerts={settings.admin_overdue_alerts}
            reminderDaysBefore={settings.reminder_days_before}
            adminEmail={settings.admin_email}
          />
        )}

        <div className="grid gap-3 rounded-lg border p-4 sm:p-5">
          <div>
            <h2 className="font-semibold">Scheduled processing</h2>
            <p className="mt-1 text-sm text-gray-500">
              Run the scheduled job automatically or trigger a scan by hand.
              Every run is idempotent.
            </p>
          </div>
          {canManage && <RunNotificationsForm />}
          <dl className="grid gap-1 border-t pt-3 text-xs text-gray-500">
            <div className="flex justify-between gap-3">
              <dt>Last run</dt>
              <dd>{settings.last_run_at ?? "Never"}</dd>
            </div>
            {settings.last_run_summary && (
              <div className="flex justify-between gap-3">
                <dt>Result</dt>
                <dd className="text-right">{settings.last_run_summary}</dd>
              </div>
            )}
          </dl>
          <p className="border-t pt-3 text-xs text-gray-500">
            Endpoint: <code>/api/notifications/run</code>. Requires{" "}
            <code>Authorization: Bearer</code> matching{" "}
            <code>NOTIFICATION_CRON_SECRET</code> (or <code>CRON_SECRET</code>).
          </p>
        </div>
      </div>

      <section className="mt-8" aria-labelledby="history-heading">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="history-heading" className="text-lg font-semibold">
              Notification history
            </h2>
            <p className="text-sm text-gray-500">
              Administrator view. Recipient addresses are masked; message
              details stay available for auditing.
            </p>
          </div>
          <p className="text-sm text-gray-500">
            <span className="font-medium text-foreground">{rows.length}</span>{" "}
            shown
          </p>
        </div>

        <nav aria-label="Notification type" className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/notifications"
            aria-current={selected === null ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              selected === null
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-black"
                : "hover:bg-gray-50 dark:hover:bg-gray-900"
            }`}
          >
            All <span className="tabular-nums opacity-70">{stats.total}</span>
          </Link>
          {NOTIFICATION_TYPES.map((type) => {
            const current = selected === type;
            return (
              <Link
                key={type}
                href={`/notifications?type=${type}`}
                aria-current={current ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  current
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-black"
                    : "hover:bg-gray-50 dark:hover:bg-gray-900"
                }`}
              >
                {NOTIFICATION_TYPE_LABELS[type]}{" "}
                <span className="tabular-nums opacity-70">
                  {counts.get(type) ?? 0}
                </span>
              </Link>
            );
          })}
        </nav>

        {rows.length === 0 ? (
          <p className="mt-4 rounded-lg border p-6 text-sm text-gray-500">
            {selected
              ? `No ${NOTIFICATION_TYPE_LABELS[selected].toLowerCase()} notifications have been recorded yet.`
              : "No notifications have been recorded yet. Issue or return a book, suspend a membership, or run the reminder scan."}
          </p>
        ) : (
          <NotificationLog rows={rows} />
        )}
      </section>
    </>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 rounded-lg border" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-80 rounded-lg border lg:col-span-2" />
        <div className="h-64 rounded-lg border" />
      </div>
      <div className="mt-8 h-80 rounded-lg border" />
    </div>
  );
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const user = await requirePagePermission("notifications.read");
  const canManage = hasPermission(user, "notifications.manage");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <LibraryBrand />
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            Notifications & reminders
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {canManage
              ? "Configure member and administrator notifications, run reminders and audit every message."
              : "Review notification history and delivery results."}
          </p>
        </div>
        <AppNav current="notifications" />
      </header>

      <Suspense fallback={<NotificationsSkeleton />}>
        <NotificationsView searchParams={searchParams} canManage={canManage} />
      </Suspense>
    </main>
  );
}
