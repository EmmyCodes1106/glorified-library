import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { emailProviderStatus } from "@/lib/email";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  loadNotificationSettings,
  type NotificationType,
} from "@/lib/notifications";
import { AlertTriangle, Bell, Mail, Send } from "lucide-react";
import { EmptyState, SectionHeader, StatCard } from "@/components/ui";
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

const TYPE_CLASSES: Record<NotificationType, string> = {
  borrow_confirmation: "badge-success",
  return_confirmation: "badge-info",
  due_reminder: "badge-warning",
  overdue_notice: "badge-danger",
  suspension_notice: "badge-neutral",
  admin_overdue_alert: "badge-neutral",
};

function TypeBadge({ type }: { type: NotificationType }) {
  return (
    <span className={`badge ${TYPE_CLASSES[type]}`}>
      {NOTIFICATION_TYPE_LABELS[type]}
    </span>
  );
}

const STATUS_CLASSES: Record<NotificationRow["email_status"], string> = {
  sent: "badge-success",
  failed: "badge-danger",
  skipped: "badge-neutral",
  pending: "badge-warning",
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
      <span className={`badge ${STATUS_CLASSES[row.email_status]}`}>
        {STATUS_LABELS[row.email_status]}
      </span>
      {row.sent && <p className="mt-1 text-[11px] text-muted">Sent {row.sent}</p>}
      {row.email_error && (
        <p
          className={`mt-1 max-w-[220px] break-words text-[11px] ${
            row.email_status === "failed" ? "text-danger" : "text-muted"
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
      <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
        View message
      </summary>
      <pre className="mt-2 max-w-xl whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 p-3 font-sans text-xs text-muted-strong">
        {row.body}
      </pre>
    </details>
  );
}

function NotificationLog({ rows }: { rows: NotificationRow[] }) {
  return (
    <>
      <div className="table-wrap mt-4 hidden md:block">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[960px]">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Type</th>
                <th scope="col">Recipient</th>
                <th scope="col">Notification</th>
                <th scope="col">Email</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="text-xs">
                    <p>{row.created}</p>
                    <p className="text-muted">#{row.id}</p>
                  </td>
                  <td>
                    <TypeBadge type={row.type} />
                  </td>
                  <td className="text-xs">
                    <p>{maskEmail(row.recipient)}</p>
                    <p className="capitalize text-muted">{row.audience}</p>
                  </td>
                  <td>
                    <p className="font-medium">{row.subject}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {row.member_id && (
                        <Link
                          href={`/members/${row.member_id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          Member
                        </Link>
                      )}
                      {row.member_id && row.loan_id && " · "}
                      {row.loan_id && (
                        <Link
                          href={`/circulation?status=all&q=${row.loan_id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          Loan #{row.loan_id}
                        </Link>
                      )}
                    </p>
                    <MessageDetails row={row} />
                  </td>
                  <td>
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
          <li key={row.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{row.subject}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {row.created} · #{row.id}
                </p>
              </div>
              <TypeBadge type={row.type} />
            </div>
            <p className="mt-2 text-xs text-muted">
              To {maskEmail(row.recipient)} · {row.audience}
            </p>
            <p className="mt-1 text-xs text-muted">
              {row.member_id && (
                <Link
                  href={`/members/${row.member_id}`}
                  className="font-medium text-brand hover:underline"
                >
                  Member
                </Link>
              )}
              {row.member_id && row.loan_id && " · "}
              {row.loan_id && (
                <Link
                  href={`/circulation?status=all&q=${row.loan_id}`}
                  className="font-medium text-brand hover:underline"
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Notifications"
          value={stats.total}
          hint="Recorded events"
          icon={Bell}
          tone="neutral"
        />
        <StatCard
          label="Emailed"
          value={stats.sent}
          hint={`Delivered through ${provider.provider}`}
          icon={Send}
          tone="success"
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          hint="Delivery errors to review"
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Skipped"
          value={stats.skipped}
          hint="No provider, recipient or email disabled"
          icon={Mail}
          tone="warning"
        />
      </div>

      {provider.configured ? (
        <p className="rounded-lg border border-success/25 bg-success-soft p-3 text-sm text-success">
          Email delivery is configured through {provider.provider}.
        </p>
      ) : (
        <div className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning">
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
            in the server environment to send real email through{" "}
            {provider.provider}.
            Notifications are still recorded and marked skipped — delivery is
            never simulated.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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

        <div className="card grid gap-3 p-5">
          <div>
            <h2 className="font-semibold">Scheduled processing</h2>
            <p className="mt-1 text-sm text-muted">
              Run the scheduled job automatically or trigger a scan by hand.
              Every run is idempotent.
            </p>
          </div>
          {canManage && <RunNotificationsForm />}
          <dl className="grid gap-1 border-t border-line pt-3 text-xs text-muted">
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
          <p className="border-t border-line pt-3 text-xs text-muted">
            Endpoint: <code>/api/notifications/run</code>. Requires{" "}
            <code>Authorization: Bearer</code> matching{" "}
            <code>NOTIFICATION_CRON_SECRET</code> (or <code>CRON_SECRET</code>).
          </p>
        </div>
      </div>

      <section aria-labelledby="history-heading">
        <SectionHeader
          id="history-heading"
          title="Notification history"
          description="Administrator view. Recipient addresses are masked; message details stay available for auditing."
          action={
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">
                {rows.length}
              </span>{" "}
              shown
            </p>
          }
        />

        <nav aria-label="Notification type" className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/notifications"
            aria-current={selected === null ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              selected === null
                ? "border-brand bg-brand text-on-brand"
                : "border-line text-muted-strong hover:border-line-strong hover:bg-surface-2 hover:text-foreground"
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
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  current
                    ? "border-brand bg-brand text-on-brand"
                    : "border-line text-muted-strong hover:border-line-strong hover:bg-surface-2 hover:text-foreground"
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
          <div className="mt-4">
            <EmptyState
              icon={Mail}
              title="No notifications yet"
              description={
                selected
                  ? `No ${NOTIFICATION_TYPE_LABELS[selected].toLowerCase()} notifications have been recorded yet.`
                  : "Issue or return a book, suspend a membership, or run the reminder scan to record the first notification."
              }
            />
          </div>
        ) : (
          <NotificationLog rows={rows} />
        )}
      </section>
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card h-80 lg:col-span-2" />
        <div className="card h-64" />
      </div>
      <div className="card h-80" />
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
    <div className="space-y-6">
      <p className="-mt-2 text-sm text-muted">
        {canManage
          ? "Configure member and administrator notifications, run reminders and audit every message."
          : "Review notification history and delivery results."}
      </p>

      <Suspense fallback={<NotificationsSkeleton />}>
        <NotificationsView searchParams={searchParams} canManage={canManage} />
      </Suspense>
    </div>
  );
}
