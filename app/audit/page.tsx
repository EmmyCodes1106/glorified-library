import Link from "next/link";
import { connection } from "next/server";
import sql from "@/db";
import AppNav from "../app-nav";
import LibraryBrand from "../library-brand";
import { requirePagePermission } from "@/lib/auth/dal";

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
    return "border-red-300 text-red-700 dark:border-red-900 dark:text-red-400";
  }
  if (action.startsWith("auth.")) {
    return "border-blue-300 text-blue-700 dark:border-blue-900 dark:text-blue-400";
  }
  if (action.includes("delete") || action.includes("revoked")) {
    return "border-orange-300 text-orange-700 dark:border-orange-900 dark:text-orange-400";
  }
  return "text-gray-600 dark:text-gray-300";
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
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <LibraryBrand />
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Audit trail</h1>
          <p className="mt-1 text-sm text-gray-500">
            Security events and administrative actions recorded by the server.
          </p>
        </div>
        <AppNav current="audit" />
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Recorded events
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {summary?.total ?? 0}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Last 24 hours
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {summary?.last_day ?? 0}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Failed sign-ins · 24h
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
            {summary?.failed_day ?? 0}
          </p>
        </div>
      </div>

      <form method="get" className="mb-4 rounded-lg border p-4" role="search">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Search</span>
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Summary, person, email or record ID"
              className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Action</span>
            <select
              name="action"
              defaultValue={action}
              className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
            >
              <option value="">All actions</option>
              {actions.map((item) => (
                <option key={item.action} value={item.action}>
                  {item.action}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-3">
            <button className="rounded bg-white px-4 py-2 text-sm font-medium text-black">
              Filter
            </button>
            {hasFilters && (
              <Link
                href="/audit"
                className="self-center text-sm underline underline-offset-4"
              >
                Clear
              </Link>
            )}
          </div>
        </div>
      </form>

      <p className="mb-3 text-sm text-gray-500">
        Showing the most recent {logs.length} matching {logs.length === 1 ? "event" : "events"}.
        Audit records cannot be edited or deleted from the app.
      </p>

      {logs.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-gray-500">
          No audit events match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Summary</th>
                <th className="px-3 py-2 font-medium">Record</th>
                <th className="px-3 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b last:border-b-0">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                    {log.created_at}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{log.actor_name ?? "Unknown"}</p>
                    <p className="text-xs text-gray-500">
                      {log.actor_email ?? "—"}
                      {log.actor_role ? ` · ${log.actor_role}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${actionTone(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <p>{log.summary}</p>
                    {log.metadata && (
                      <details className="mt-1 text-xs text-gray-500">
                        <summary className="cursor-pointer">Details</summary>
                        <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-words">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                    {log.entity_type
                      ? `${log.entity_type}${log.entity_id ? ` #${log.entity_id}` : ""}`
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                    {log.ip_address ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
