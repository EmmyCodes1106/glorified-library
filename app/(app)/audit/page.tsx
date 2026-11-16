import Link from "next/link";
import { connection } from "next/server";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { Clock, History, ShieldAlert } from "lucide-react";
import { EmptyState, PageIntro, StatCard } from "@/components/ui";

export const metadata = {
  title: "Audit trail",
};

// every request needs the session cookie before any data is read
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type AuditRow = {
  id: number;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function actionTone(action: string) {
  if (action.includes("failed") || action.includes("blocked")) {
    return "badge-danger";
  }
  if (action.startsWith("auth.")) {
    return "badge-info";
  }
  if (action.includes("delete") || action.includes("revoked")) {
    return "badge-warning";
  }
  return "badge-neutral";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  await requirePagePermission("audit.read");

  const params = await searchParams;
  const q = first(params.q).trim();
  const action = first(params.action).trim();
  const like = `%${q}%`;

  const [logs, actions, stats] = await Promise.all([
    sql<AuditRow[]>`
      select
        id,
        to_char(created_at, 'DD Mon YYYY HH24:MI:SS') as created_at,
        actor_name,
        actor_email,
        actor_role,
        action,
        entity_type,
        entity_id,
        summary,
        ip_address,
        metadata
      from audit_logs
      where (
        ${q} = ''
        or summary ilike ${like}
        or coalesce(actor_name, '') ilike ${like}
        or coalesce(actor_email, '') ilike ${like}
        or coalesce(entity_id, '') = ${q}
      )
      ${action ? sql`and action = ${action}` : sql``}
      order by created_at desc
      limit 200
    `,
    sql<{ action: string }[]>`
      select distinct action from audit_logs order by action
    `,
    sql<{ total: number; last_day: number; failed_day: number }[]>`
      select
        count(*)::int as total,
        count(*) filter (where created_at > now() - interval '24 hours')::int
          as last_day,
        count(*) filter (
          where created_at > now() - interval '24 hours'
            and action in ('auth.login_failed', 'auth.login_blocked')
        )::int as failed_day
      from audit_logs
    `,
  ]);

  const summary = stats[0];
  const hasFilters = Boolean(q || action);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Audit trail</span>
        <span className="text-muted">/</span>
        <Link
          href="/audit/email"
          className="text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Email delivery
        </Link>
      </div>

      <PageIntro>
        Security events and administrative actions recorded by the server.
      </PageIntro>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Recorded events"
          value={summary?.total ?? 0}
          hint="Security and admin actions on record"
          icon={History}
          tone="brand"
        />
        <StatCard
          label="Last 24 hours"
          value={summary?.last_day ?? 0}
          hint="Recent activity across the app"
          icon={Clock}
          tone="neutral"
        />
        <StatCard
          label="Failed sign-ins · 24h"
          value={summary?.failed_day ?? 0}
          hint="Blocked or unsuccessful attempts"
          icon={ShieldAlert}
          tone={(summary?.failed_day ?? 0) > 0 ? "danger" : "success"}
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
              placeholder="Summary, person, email or record ID"
              className="field w-full"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="label">Action</span>
            <select
              name="action"
              defaultValue={action}
              className="field w-full"
            >
              <option value="">All actions</option>
              {actions.map((item) => (
                <option key={item.action} value={item.action}>
                  {item.action}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary">Filter</button>
            {hasFilters && (
              <Link
                href="/audit"
                className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
              >
                Clear
              </Link>
            )}
          </div>
        </div>
      </form>

      <p className="text-sm text-muted">
        Showing the most recent {logs.length} matching{" "}
        {logs.length === 1 ? "event" : "events"}. Audit records cannot be edited
        or deleted from the app.
      </p>

      {logs.length === 0 ? (
        <EmptyState
          icon={History}
          title="No audit events"
          description="No audit events match these filters."
        />
      ) : (
        <>
          <div className="table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="data-table min-w-[880px]">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Action</th>
                    <th scope="col">Summary</th>
                    <th scope="col">Record</th>
                    <th scope="col">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap text-xs text-muted">
                        {log.created_at}
                      </td>
                      <td>
                        <p className="font-medium">
                          {log.actor_name ?? "Unknown"}
                        </p>
                        <p className="text-xs text-muted">
                          {log.actor_email ?? "—"}
                          {log.actor_role ? ` · ${log.actor_role}` : ""}
                        </p>
                      </td>
                      <td>
                        <span
                          className={`badge whitespace-nowrap ${actionTone(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td>
                        <p>{log.summary}</p>
                        {log.metadata && (
                          <details className="mt-1 text-xs text-muted">
                            <summary className="cursor-pointer hover:text-foreground">
                              Details
                            </summary>
                            <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 p-2">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-xs text-muted">
                        {log.entity_type
                          ? `${log.entity_type}${log.entity_id ? ` #${log.entity_id}` : ""}`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap text-xs text-muted">
                        {log.ip_address ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="grid gap-3 md:hidden">
            {logs.map((log) => (
              <li key={log.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{log.actor_name ?? "Unknown"}</p>
                    <p className="text-xs text-muted">{log.created_at}</p>
                  </div>
                  <span className={`badge ${actionTone(log.action)}`}>
                    {log.action}
                  </span>
                </div>
                <p className="mt-3 text-sm">{log.summary}</p>
                <p className="mt-1 break-all text-xs text-muted">
                  {log.actor_email ?? "—"}
                  {log.entity_type
                    ? ` · ${log.entity_type}${log.entity_id ? ` #${log.entity_id}` : ""}`
                    : ""}
                  {log.ip_address ? ` · ${log.ip_address}` : ""}
                </p>
                {log.metadata && (
                  <details className="mt-2 text-xs text-muted">
                    <summary className="cursor-pointer hover:text-foreground">
                      Details
                    </summary>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 p-2">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
