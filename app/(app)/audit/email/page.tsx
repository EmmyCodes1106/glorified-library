import Link from "next/link";
import { connection } from "next/server";
import { AlertTriangle, MailCheck, Send } from "lucide-react";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { emailProviderStatus } from "@/lib/email";
import { EmptyState, PageIntro, StatCard } from "@/components/ui";

export const metadata = {
  title: "Email delivery",
};

// every request needs the session cookie before any data is read
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type EmailRow = {
  id: number;
  created_at: string;
  recipient: string;
  subject: string;
  purpose: string;
  status: "sent" | "skipped" | "failed";
  detail: string | null;
};

const STATUSES = ["sent", "skipped", "failed"] as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function statusTone(status: EmailRow["status"]) {
  if (status === "sent") return "badge-success";
  if (status === "skipped") return "badge-warning";
  return "badge-danger";
}

export default async function EmailLogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  await requirePagePermission("audit.read");

  const params = await searchParams;
  const q = first(params.q).trim();
  const rawStatus = first(params.status).trim();
  const status = STATUSES.includes(rawStatus as EmailRow["status"])
    ? rawStatus
    : "";
  const like = `%${q}%`;
  const provider = emailProviderStatus();

  const [rows, stats] = await Promise.all([
    sql<EmailRow[]>`
      select
        id,
        to_char(created_at, 'DD Mon YYYY HH24:MI:SS') as created_at,
        recipient,
        subject,
        purpose,
        status,
        detail
      from email_log
      where (
        ${q} = ''
        or recipient ilike ${like}
        or subject ilike ${like}
      )
      ${status ? sql`and status = ${status}` : sql``}
      order by created_at desc
      limit 200
    `,
    sql<
      { total: number; sent_day: number; problems_day: number }[]
    >`
      select
        count(*)::int as total,
        count(*) filter (
          where created_at > now() - interval '24 hours' and status = 'sent'
        )::int as sent_day,
        count(*) filter (
          where created_at > now() - interval '24 hours'
            and status in ('skipped', 'failed')
        )::int as problems_day
      from email_log
    `,
  ]);

  const summary = stats[0];
  const hasFilters = Boolean(q || status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/audit"
          className="text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Audit trail
        </Link>
        <span className="text-muted">/</span>
        <span className="font-medium">Email delivery</span>
      </div>

      <PageIntro>
        Confirmation and password-reset email sent through{" "}
        {provider.provider}, with the provider response for each attempt.
      </PageIntro>

      {!provider.configured && (
        <p className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning">
          Email delivery is not configured on the server. Set{" "}
          {provider.missing.join(" and ")} to start sending email. Until then,
          messages are recorded as skipped.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Logged emails"
          value={summary?.total ?? 0}
          hint="Verification and password-reset messages"
          icon={MailCheck}
          tone="brand"
        />
        <StatCard
          label="Sent · 24h"
          value={summary?.sent_day ?? 0}
          hint={`Accepted by ${provider.provider} in the last day`}
          icon={Send}
          tone="success"
        />
        <StatCard
          label="Problems · 24h"
          value={summary?.problems_day ?? 0}
          hint="Skipped or failed deliveries"
          icon={AlertTriangle}
          tone={(summary?.problems_day ?? 0) > 0 ? "danger" : "neutral"}
        />
      </div>

      <form method="get" className="card p-4 sm:p-5" role="search">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-1 text-sm">
            <span className="label">Search</span>
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Recipient or subject"
              className="field w-full"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="label">Status</span>
            <select name="status" defaultValue={status} className="field w-full">
              <option value="">All statuses</option>
              <option value="sent">Sent</option>
              <option value="skipped">Skipped</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary">Filter</button>
            {hasFilters && (
              <Link
                href="/audit/email"
                className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
              >
                Clear
              </Link>
            )}
          </div>
        </div>
      </form>

      <p className="text-sm text-muted">
        Showing the most recent {rows.length} matching{" "}
        {rows.length === 1 ? "email" : "emails"}. Delivery details are written
        by the server and cannot be edited.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={MailCheck}
          title="No email records"
          description="Verification and password-reset emails will appear here once they are sent."
        />
      ) : (
        <>
          <div className="table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="data-table min-w-[820px]">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Recipient</th>
                    <th scope="col">Purpose</th>
                    <th scope="col">Status</th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap text-xs text-muted">
                        {row.created_at}
                      </td>
                      <td>
                        <p className="break-all font-medium">{row.recipient}</p>
                        <p className="text-xs text-muted">{row.subject}</p>
                      </td>
                      <td className="whitespace-nowrap text-xs text-muted">
                        {row.purpose}
                      </td>
                      <td>
                        <span
                          className={`badge whitespace-nowrap ${statusTone(
                            row.status
                          )}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="max-w-sm break-words text-xs text-muted">
                        {row.detail ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-medium">{row.recipient}</p>
                    <p className="text-xs text-muted">{row.created_at}</p>
                  </div>
                  <span className={`badge ${statusTone(row.status)}`}>
                    {row.status}
                  </span>
                </div>
                <p className="mt-3 text-sm">{row.subject}</p>
                <p className="mt-1 text-xs text-muted">{row.purpose}</p>
                {row.detail && (
                  <p className="mt-2 break-words rounded-lg border border-line bg-surface-2 p-2 text-xs text-muted">
                    {row.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
