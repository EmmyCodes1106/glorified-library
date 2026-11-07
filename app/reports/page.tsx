import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getLibraryIdentity } from "@/lib/settings";
import AppNav from "../app-nav";
import LibraryBrand from "../library-brand";
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
  type ReportStat,
} from "@/lib/reports";
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

function StatCard({
  stat,
  currency,
}: {
  stat: ReportStat;
  currency: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {stat.label}
      </p>
      <p className="mt-2 break-words text-2xl font-semibold tabular-nums sm:text-3xl">
        {formatReportStat(stat, currency)}
      </p>
      {stat.hint && <p className="mt-1 text-xs text-gray-500">{stat.hint}</p>}
    </div>
  );
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
      <p className="mt-3 rounded-lg border p-6 text-sm text-gray-500">
        {section.emptyMessage}
      </p>
    );
  }

  return (
    <>
      <div className="mt-3 hidden overflow-hidden rounded-lg border md:block print:block">
        <div className="overflow-x-auto">
          <table
            className="report-table w-full text-[13px]"
            style={{ minWidth }}
          >
            <thead className="border-b bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500 dark:bg-gray-900">
              <tr>
                {section.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`p-2.5 font-medium ${
                      column.format === "number" || column.format === "money"
                        ? "text-right"
                        : ""
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {section.rows.map((row, index) => (
                <tr key={index} className="align-top">
                  {section.columns.map((column) => {
                    const numeric =
                      column.format === "number" || column.format === "money";
                    return (
                      <td
                        key={column.key}
                        className={`p-2.5 ${
                          numeric ? "text-right tabular-nums" : ""
                        }`}
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

      <ul className="mt-3 grid grid-cols-1 gap-3 md:hidden print:hidden">
        {section.rows.map((row, index) => {
          const [primary, ...rest] = section.columns;
          return (
            <li key={index} className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                {primary.label}
              </p>
              <p className="mt-1 break-words font-medium">
                {formatReportValue(row[primary.key], primary.format, currency)}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {rest.map((column) => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-gray-500">{column.label}</dt>
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
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          {identity.name}
        </p>
        <h2 className="mt-1 text-2xl font-bold">{data.title}</h2>
        <p className="mt-1 text-sm">Generated {data.generatedLabel}</p>
        <p className="mt-1 text-xs text-gray-500">
          {data.filterSummary.join(" · ")}
        </p>
      </div>

      <div className="print:hidden">
        <nav
          aria-label="Report type"
          className="flex flex-wrap gap-2 border-b pb-4"
        >
          {REPORT_DEFINITIONS.map((item) => {
            const current = item.id === data.id;
            return (
              <Link
                key={item.id}
                href={queryForReport(data, item.id)}
                aria-current={current ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium sm:text-sm ${
                  current
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-black"
                    : "hover:bg-gray-50 dark:hover:bg-gray-900"
                }`}
              >
                {item.shortTitle}
              </Link>
            );
          })}
        </nav>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold">{data.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{data.description}</p>
            <p className="mt-2 text-xs text-gray-500">
              Generated {data.generatedLabel} · Source: live library records
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {filterChips(data).map((chip) => (
                <li
                  key={chip}
                  className="rounded-full border px-2.5 py-0.5 text-[11px] text-gray-500"
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
                  className="rounded bg-white px-3 py-2 text-sm font-medium text-black"
                >
                  Export PDF
                </a>
                <a
                  href={exportHref(data, "xlsx")}
                  className="rounded border px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-900"
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
          className="mt-5 grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input type="hidden" name="report" value={data.id} />

          {definition.usesDates && (
            <>
              <label className="grid gap-1 text-sm">
                <span className="text-gray-500">
                  From ({definition.dateLabel?.toLowerCase()})
                </span>
                <input
                  type="date"
                  name="start"
                  defaultValue={data.filters.start}
                  className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-gray-500">To</span>
                <input
                  type="date"
                  name="end"
                  defaultValue={data.filters.end}
                  className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
                />
              </label>
            </>
          )}

          {definition.usesCategory && (
            <label className="grid gap-1 text-sm">
              <span className="text-gray-500">Category</span>
              <select
                name="category"
                defaultValue={data.filters.category ?? ""}
                className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
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
            <span className="text-gray-500">Search report rows</span>
            <input
              type="search"
              name="q"
              defaultValue={data.filters.q}
              placeholder="Title, member, book ID, reason..."
              className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
            />
          </label>

          {definition.usesPeriod && (
            <label className="grid gap-1 text-sm">
              <span className="text-gray-500">Group activity by</span>
              <select
                name="period"
                defaultValue={data.filters.period}
                className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
              >
                <option value="monthly">Month</option>
                <option value="yearly">Year</option>
              </select>
            </label>
          )}

          <div className="flex items-end gap-3">
            <button className="rounded bg-white px-4 py-2 text-sm font-medium text-black">
              Apply filters
            </button>
            <Link
              href={`/reports?report=${data.id}`}
              className="text-sm underline underline-offset-4"
            >
              Reset
            </Link>
          </div>
        </form>

        {data.id === "fines" && (
          <p className="mt-2 text-xs text-gray-500">
            The date range filters payments and waivers. Outstanding balances
            always reflect the current ledger.
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {data.stats.map((stat) => (
          <StatCard
            key={stat.label}
            stat={stat}
            currency={data.currencySymbol}
          />
        ))}
      </div>

      {data.sections.map((section) => (
        <section
          key={section.key}
          className="mt-8"
          aria-labelledby={`report-${section.key}`}
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 id={`report-${section.key}`} className="text-lg font-semibold">
                {section.title}
              </h3>
              {section.description && (
                <p className="text-sm text-gray-500">{section.description}</p>
              )}
            </div>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-foreground">
                {section.rows.length}
              </span>{" "}
              {section.rows.length === 1 ? "row" : "rows"}
            </p>
          </div>

          <ReportTable section={section} currency={data.currencySymbol} />
        </section>
      ))}

      <p className="mt-8 hidden text-xs text-gray-500 print:block">
        Generated from live {identity.name} records on {data.generatedLabel}.
      </p>
    </>
  );
}

function ReportsSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="h-10 rounded border" />
      <div className="mt-5 h-20 rounded border" />
      <div className="mt-5 h-28 rounded border" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-28 rounded-lg border" />
        ))}
      </div>
      <div className="mt-8 h-72 rounded-lg border" />
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
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <LibraryBrand />
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            Reports &amp; exports
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Generate operational reports from live records, then print or export
            them.
          </p>
        </div>
        <AppNav current="reports" />
      </header>

      <Suspense fallback={<ReportsSkeleton />}>
        <ReportsView searchParams={searchParams} canExport={canExport} />
      </Suspense>
    </main>
  );
}
