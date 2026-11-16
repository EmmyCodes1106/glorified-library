import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getLibraryIdentity } from "@/lib/settings";
import {
  REPORT_DEFINITIONS,
  buildReport,
  formatReportStat,
  formatReportValue,
  isReportId,
  loadCategories,
  reportDefinition,
  type ReportData,
  type ReportId,
  type ReportSection,
} from "@/lib/reports";
import { ChartColumn, FileSearch } from "lucide-react";
import {
  EmptyState,
  PageIntro,
  SectionHeader,
  StatCard,
} from "@/components/ui";
import PrintButton from "./print-button";

export const metadata = {
  title: "Reports",
};

// every request needs the session cookie before any data is read
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function filterChips(data: ReportData) {
  const chips = data.filterSummary.slice();
  if (chips.length === 0) chips.push("All records");
  return chips;
}

function queryForReport(data: ReportData, id: ReportId) {
  const target = reportDefinition(id);
  const params = new URLSearchParams();
  params.set("report", id);
  if (target.usesDates) {
    params.set("start", data.filters.start);
    params.set("end", data.filters.end);
  }
  if (target.usesCategory && data.filters.category) {
    params.set("category", String(data.filters.category));
  }
  if (data.filters.q) params.set("q", data.filters.q);
  if (target.usesPeriod) params.set("period", data.filters.period);
  return `/reports?${params.toString()}`;
}

function exportHref(data: ReportData, format: "pdf" | "xlsx") {
  const definition = reportDefinition(data.id);
  const params = new URLSearchParams();
  params.set("report", data.id);
  params.set("format", format);
  if (definition.usesDates) {
    params.set("start", data.filters.start);
    params.set("end", data.filters.end);
  }
  if (definition.usesCategory && data.filters.category) {
    params.set("category", String(data.filters.category));
  }
  if (data.filters.q) params.set("q", data.filters.q);
  if (definition.usesPeriod) params.set("period", data.filters.period);
  return `/api/reports/export?${params.toString()}`;
}

function ReportTable({
  section,
  currency,
}: {
  section: ReportSection;
  currency: string;
}) {
  const minWidth = Math.max(720, section.columns.length * 96);

  if (section.rows.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={FileSearch}
          title="Nothing to report"
          description={section.emptyMessage}
        />
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap mt-4 hidden md:block print:block">
        <div className="overflow-x-auto">
          <table
            className="data-table report-table"
            style={{ minWidth }}
          >
            <thead>
              <tr>
                {section.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={
                      column.format === "number" || column.format === "money"
                        ? "text-right"
                        : ""
                    }
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, index) => (
                <tr key={index}>
                  {section.columns.map((column) => {
                    const numeric =
                      column.format === "number" || column.format === "money";
                    return (
                      <td
                        key={column.key}
                        className={numeric ? "text-right tabular-nums" : ""}
                      >
                        {formatReportValue(
                          row[column.key],
                          column.format,
                          currency
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 md:hidden print:hidden">
        {section.rows.map((row, index) => {
          const [primary, ...rest] = section.columns;
          return (
            <li key={index} className="card p-4">
              <p className="text-xs font-medium text-muted">
                {primary.label}
              </p>
              <p className="mt-1 break-words font-medium">
                {formatReportValue(row[primary.key], primary.format, currency)}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {rest.map((column) => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-muted">{column.label}</dt>
                    <dd className="break-words">
                      {formatReportValue(
                        row[column.key],
                        column.format,
                        currency
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}

async function ReportsView({
  searchParams,
  canExport,
}: {
  searchParams: SearchParams;
  canExport: boolean;
}) {
  await connection();
  const params = await searchParams;
  const reportParam = first(params.report);
  const report: ReportId = isReportId(reportParam) ? reportParam : "inventory";
  const definition = reportDefinition(report);

  const [data, categories, identity] = await Promise.all([
    buildReport(report, {
      start: first(params.start),
      end: first(params.end),
      category: first(params.category),
      q: first(params.q),
      period: first(params.period),
    }),
    loadCategories(),
    getLibraryIdentity(),
  ]);

  return (
    <>
      <div className="mb-5 hidden border-b pb-4 print:block">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          {identity.name}
        </p>
        <h2 className="mt-1 text-2xl font-bold">{data.title}</h2>
        <p className="mt-1 text-sm">Generated {data.generatedLabel}</p>
        <p className="mt-1 text-xs text-muted">
          {data.filterSummary.join(" · ")}
        </p>
      </div>

      <div className="print:hidden">
        <nav
          aria-label="Report type"
          className="flex flex-wrap gap-2 border-b border-line pb-4"
        >
          {REPORT_DEFINITIONS.map((item) => {
            const current = item.id === data.id;
            return (
              <Link
                key={item.id}
                href={queryForReport(data, item.id)}
                aria-current={current ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                  current
                    ? "border-brand bg-brand text-on-brand"
                    : "border-line text-muted-strong hover:border-line-strong hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {item.shortTitle}
              </Link>
            );
          })}
        </nav>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight">{data.title}</h2>
            <p className="mt-1 text-sm text-muted">{data.description}</p>
            <p className="mt-2 text-xs text-muted">
              Generated {data.generatedLabel} · Source: live library records
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {filterChips(data).map((chip) => (
                <li
                  key={chip}
                  className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted"
                >
                  {chip}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PrintButton />
            {canExport && (
              <>
                <a
                  href={exportHref(data, "pdf")}
                  className="btn btn-sm btn-primary"
                >
                  Export PDF
                </a>
                <a
                  href={exportHref(data, "xlsx")}
                  className="btn btn-sm btn-secondary"
                >
                  Export Excel
                </a>
              </>
            )}
          </div>
        </div>

        <form
          method="get"
          role="search"
          className="card mt-5 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input type="hidden" name="report" value={data.id} />

          {definition.usesDates && (
            <>
              <label className="grid gap-1 text-sm">
                <span className="label">
                  From ({definition.dateLabel?.toLowerCase()})
                </span>
                <input
                  type="date"
                  name="start"
                  defaultValue={data.filters.start}
                  className="field w-full"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="label">To</span>
                <input
                  type="date"
                  name="end"
                  defaultValue={data.filters.end}
                  className="field w-full"
                />
              </label>
            </>
          )}

          {definition.usesCategory && (
            <label className="grid gap-1 text-sm">
              <span className="label">Category</span>
              <select
                name="category"
                defaultValue={data.filters.category ?? ""}
                className="field w-full"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="grid gap-1 text-sm">
            <span className="label">Search report rows</span>
            <input
              type="search"
              name="q"
              defaultValue={data.filters.q}
              placeholder="Title, member, book ID, reason..."
              className="field w-full"
            />
          </label>

          {definition.usesPeriod && (
            <label className="grid gap-1 text-sm">
              <span className="label">Group activity by</span>
              <select
                name="period"
                defaultValue={data.filters.period}
                className="field w-full"
              >
                <option value="monthly">Month</option>
                <option value="yearly">Year</option>
              </select>
            </label>
          )}

          <div className="flex items-end gap-3">
            <button className="btn btn-primary">
              Apply filters
            </button>
            <Link
              href={`/reports?report=${data.id}`}
              className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
            >
              Reset
            </Link>
          </div>
        </form>

        {data.id === "fines" && (
          <p className="mt-2 text-xs text-muted">
            The date range filters payments and waivers. Outstanding balances
            always reflect the current ledger.
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {data.stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={formatReportStat(stat, data.currencySymbol)}
            hint={stat.hint}
            icon={ChartColumn}
            tone="brand"
          />
        ))}
      </div>

      {data.sections.map((section) => (
        <section
          key={section.key}
          className="mt-8"
          aria-labelledby={`report-${section.key}`}
        >
          <SectionHeader
            id={`report-${section.key}`}
            title={section.title}
            description={section.description ?? undefined}
            action={
              <p className="text-sm text-muted">
                <span className="font-semibold text-foreground">
                  {section.rows.length}
                </span>{" "}
                {section.rows.length === 1 ? "row" : "rows"}
              </p>
            }
          />

          <ReportTable section={section} currency={data.currencySymbol} />
        </section>
      ))}

      <p className="mt-8 hidden text-xs text-muted print:block">
        Generated from live {identity.name} records on {data.generatedLabel}.
      </p>
    </>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="skeleton h-10 rounded-lg" />
      <div className="skeleton h-20 rounded-xl" />
      <div className="skeleton h-28 rounded-xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="card h-24" />
        ))}
      </div>
      <div className="card h-72" />
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const user = await requirePagePermission("reports.read");
  const canExport = hasPermission(user, "reports.export");

  return (
    <div className="space-y-6">
      <PageIntro>
        Generate operational reports from live records, then print or export
        them.
      </PageIntro>

      <Suspense fallback={<ReportsSkeleton />}>
        <ReportsView searchParams={searchParams} canExport={canExport} />
      </Suspense>
    </div>
  );
}
