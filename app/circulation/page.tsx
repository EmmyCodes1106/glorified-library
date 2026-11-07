import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import AppNav from "../app-nav";
import LibraryBrand from "../library-brand";
import LoanActions from "../loan-actions";
import CheckoutForm from "./checkout-form";
import SettingsForm from "./settings-form";

export const metadata = {
  title: "Circulation",
};

// every request needs the session cookie before any data is read
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type LoanView = "all" | "active" | "overdue" | "returned";

type LoanRow = {
  id: number;
  book_id: number;
  book_code: string;
  title: string;
  author: string;
  member_id: number;
  member_code: string;
  member: string;
  borrowed: string;
  due: string;
  returned: string | null;
  overdue: boolean;
  duration_days: number;
  renewal_count: number;
};

type CirculationStats = {
  total: number;
  active: number;
  overdue: number;
  returned: number;
  available: number;
};

type MemberChoice = {
  id: number;
  code: string;
  name: string;
  open_loans: number;
  loan_limit: number;
};

type BookChoice = {
  id: number;
  code: string;
  title: string;
  author: string;
  available: number;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
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

function LoanBadge({ loan }: { loan: LoanRow }) {
  if (loan.returned) {
    return (
      <span className="inline-block shrink-0 rounded-full border border-green-300 px-2.5 py-0.5 text-[11px] font-medium text-green-700 dark:border-green-800 dark:text-green-400">
        Returned
      </span>
    );
  }
  if (loan.overdue) {
    return (
      <span className="inline-block shrink-0 rounded-full border border-red-300 px-2.5 py-0.5 text-[11px] font-medium text-red-700 dark:border-red-800 dark:text-red-400">
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-block shrink-0 rounded-full border border-orange-300 px-2.5 py-0.5 text-[11px] font-medium text-orange-700 dark:border-orange-800 dark:text-orange-400">
      Active
    </span>
  );
}

const VIEW_LABELS: Record<LoanView, string> = {
  all: "All",
  active: "Active",
  overdue: "Overdue",
  returned: "Returned",
};

async function CirculationView({
  searchParams,
  canCirculate,
}: {
  searchParams: SearchParams;
  canCirculate: boolean;
}) {
  const params = await searchParams;
  const q = first(params.q).trim();
  const statusText = first(params.status);
  const status: LoanView =
    statusText === "all" ||
    statusText === "overdue" ||
    statusText === "returned"
      ? statusText
      : "active";

  const like = `%${q}%`;
  const statusClause =
    status === "active"
      ? sql`and l.returned_on is null and l.due_on >= current_date`
      : status === "overdue"
        ? sql`and l.returned_on is null and l.due_on < current_date`
        : status === "returned"
          ? sql`and l.returned_on is not null`
          : sql``;

  const orderClause =
    status === "returned"
      ? sql`l.returned_on desc, l.id desc`
      : status === "active" || status === "overdue"
        ? sql`l.due_on asc, l.id`
        : sql`(l.returned_on is null) desc,
            case when l.returned_on is null then l.due_on end asc,
            l.returned_on desc nulls last,
            l.id`;

  const [statsRows, members, books, settings, loans] = await Promise.all([
    sql<CirculationStats[]>`
      select
        count(*)::int as total,
        count(*) filter (
          where returned_on is null and due_on >= current_date
        )::int as active,
        count(*) filter (
          where returned_on is null and due_on < current_date
        )::int as overdue,
        count(*) filter (where returned_on is not null)::int as returned,
        (
          (select coalesce(sum(total_copies), 0) from books)
          - count(*) filter (where returned_on is null)
        )::int as available
      from loans
    `,
    sql<MemberChoice[]>`
      select
        m.id,
        m.member_code as code,
        m.name,
        m.loan_limit,
        count(l.id) filter (where l.returned_on is null)::int as open_loans
      from members m
      left join loans l on l.member_id = m.id
      where m.status = 'active'
      group by m.id, m.member_code, m.name, m.loan_limit
      order by m.name
    `,
    sql<BookChoice[]>`
      select
        b.id,
        b.book_code as code,
        b.title,
        a.name as author,
        (b.total_copies - coalesce(o.open_loans, 0))::int as available
      from books b
      join authors a on a.id = b.author_id
      left join (
        select book_id, count(*)::int as open_loans
        from loans
        where returned_on is null
        group by book_id
      ) o on o.book_id = b.id
      where b.total_copies > coalesce(o.open_loans, 0)
      order by b.title
    `,
    sql<{ default_loan_days: number }[]>`
      select default_loan_days from circulation_settings where id
    `,
    sql<LoanRow[]>`
      select
        l.id,
        l.book_id,
        b.book_code,
        b.title,
        a.name as author,
        l.member_id,
        m.member_code,
        m.name as member,
        to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
        to_char(l.due_on, 'DD Mon YYYY') as due,
        to_char(l.returned_on, 'DD Mon YYYY') as returned,
        (l.returned_on is null and l.due_on < current_date) as overdue,
        l.duration_days,
        l.renewal_count
      from loans l
      join books b on b.id = l.book_id
      join authors a on a.id = b.author_id
      join members m on m.id = l.member_id
      where (
        ${q} = ''
        or m.name ilike ${like}
        or m.member_code ilike ${like}
        or coalesce(m.email, '') ilike ${like}
        or coalesce(m.phone, '') ilike ${like}
        or b.title ilike ${like}
        or b.book_code ilike ${like}
        or coalesce(b.isbn, '') ilike ${like}
        or l.id::text = ${q}
      )
      ${statusClause}
      order by ${orderClause}
    `,
  ]);

  const stats = statsRows[0];
  const defaultLoanDays = settings[0]?.default_loan_days ?? 14;

  const tabs: { value: LoanView; count: number }[] = [
    { value: "all", count: stats.total },
    { value: "active", count: stats.active },
    { value: "overdue", count: stats.overdue },
    { value: "returned", count: stats.returned },
  ];

  function tabHref(view: LoanView) {
    const query = new URLSearchParams();
    query.set("status", view);
    if (q) query.set("q", q);
    return `/circulation?${query.toString()}`;
  }

  const emptyMessage = q
    ? `No ${VIEW_LABELS[status].toLowerCase()} loans match "${q}".`
    : status === "active"
      ? "No active loans right now. Issue a book above to start one."
      : status === "overdue"
        ? "Nothing is overdue. Every open loan is still within its due date."
        : status === "returned"
          ? "No loans have been returned yet."
          : "No loans recorded yet. Issue the first book above.";

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active loans"
          value={stats.active}
          hint="Open and not overdue"
          dot="bg-orange-500"
          valueClass={stats.active > 0 ? "text-orange-600" : ""}
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          hint="Open loans past due"
          dot="bg-red-500"
          valueClass={stats.overdue > 0 ? "text-red-600" : ""}
        />
        <StatCard
          label="Returned"
          value={stats.returned}
          hint="Completed loans on record"
          dot="bg-green-600"
          valueClass={stats.returned > 0 ? "text-green-600" : ""}
        />
        <StatCard
          label="Available copies"
          value={stats.available}
          hint="Ready to issue"
          dot="bg-gray-400"
        />
      </div>

      {canCirculate && (
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <CheckoutForm
            members={members.map((member) => ({
              id: member.id,
              code: member.code,
              name: member.name,
              openLoans: member.open_loans,
              loanLimit: member.loan_limit,
            }))}
            books={books.map((book) => ({
              id: book.id,
              code: book.code,
              title: book.title,
              author: book.author,
              available: book.available,
            }))}
            defaultLoanDays={defaultLoanDays}
          />
          <SettingsForm defaultLoanDays={defaultLoanDays} />
        </div>
      )}

      <section className="mt-8" aria-labelledby="loans-heading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="loans-heading" className="text-lg font-semibold">
              Loans
            </h2>
            <p className="text-sm text-gray-500">
              Active, overdue and returned records, newest first for returns.
            </p>
          </div>
          <p className="text-sm text-gray-500">
            <span className="font-medium text-foreground">{loans.length}</span>{" "}
            shown
          </p>
        </div>

        <nav aria-label="Loan status" className="mt-3 flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const current = status === tab.value;
            return (
              <Link
                key={tab.value}
                href={tabHref(tab.value)}
                aria-current={current ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  current
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-black"
                    : "hover:bg-gray-50 dark:hover:bg-gray-900"
                }`}
              >
                {VIEW_LABELS[tab.value]}{" "}
                <span className="tabular-nums opacity-70">{tab.count}</span>
              </Link>
            );
          })}
        </nav>

        <form
          method="get"
          role="search"
          className="mt-3 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="status" value={status} />
          <label className="grid flex-1 gap-1 text-sm">
            <span className="text-gray-500">Search loans</span>
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Member, book, ISBN, member ID or loan number"
              className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
            />
          </label>
          <div className="flex items-center gap-3">
            <button className="rounded bg-white px-4 py-2 text-sm font-medium text-black">
              Search
            </button>
            {q && (
              <Link
                href={`/circulation?status=${status}`}
                className="text-sm underline"
              >
                Clear
              </Link>
            )}
          </div>
        </form>

        {loans.length === 0 ? (
          <p className="mt-4 rounded-lg border p-6 text-sm text-gray-500">
            {emptyMessage}
          </p>
        ) : (
          <>
            <div className="mt-4 hidden overflow-hidden rounded-lg border md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900">
                    <tr>
                      <th scope="col" className="p-3 font-medium">
                        Book
                      </th>
                      <th scope="col" className="p-3 font-medium">
                        Member
                      </th>
                      <th scope="col" className="p-3 font-medium">
                        Dates
                      </th>
                      <th scope="col" className="p-3 font-medium">
                        Term
                      </th>
                      <th scope="col" className="p-3 font-medium">
                        Status
                      </th>
                      <th scope="col" className="p-3 font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loans.map((loan) => (
                      <tr key={loan.id} className="align-top">
                        <td className="p-3">
                          <Link
                            href={`/?q=${encodeURIComponent(loan.book_code)}`}
                            className="font-medium underline underline-offset-4"
                          >
                            {loan.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {loan.author} · {loan.book_code}
                          </p>
                          <p className="text-xs text-gray-500">Loan #{loan.id}</p>
                        </td>
                        <td className="p-3">
                          <Link
                            href={`/members/${loan.member_id}`}
                            className="font-medium underline underline-offset-4"
                          >
                            {loan.member}
                          </Link>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {loan.member_code}
                          </p>
                        </td>
                        <td className="p-3">
                          <dl className="grid gap-0.5 text-xs">
                            <div className="flex gap-1">
                              <dt className="text-gray-500">Borrowed</dt>
                              <dd>{loan.borrowed}</dd>
                            </div>
                            <div className="flex gap-1">
                              <dt className="text-gray-500">Due</dt>
                              <dd
                                className={
                                  loan.overdue
                                    ? "font-medium text-red-600 dark:text-red-400"
                                    : ""
                                }
                              >
                                {loan.due}
                              </dd>
                            </div>
                            <div className="flex gap-1">
                              <dt className="text-gray-500">Returned</dt>
                              <dd>{loan.returned ?? "Not yet"}</dd>
                            </div>
                          </dl>
                        </td>
                        <td className="p-3 text-xs">
                          <p>{loan.duration_days} days</p>
                          {loan.renewal_count > 0 && (
                            <p className="text-gray-500">
                              Renewed {loan.renewal_count}×
                            </p>
                          )}
                        </td>
                        <td className="p-3">
                          <LoanBadge loan={loan} />
                        </td>
                        <td className="p-3">
                          {canCirculate ? (
                            <LoanActions
                              loanId={loan.id}
                              durationDays={loan.duration_days}
                              returned={Boolean(loan.returned)}
                            />
                          ) : (
                            <span className="text-xs text-gray-500">
                              Read-only
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <ul className="mt-4 grid grid-cols-1 gap-3 md:hidden">
              {loans.map((loan) => (
                <li key={loan.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/?q=${encodeURIComponent(loan.book_code)}`}
                        className="break-words font-medium underline underline-offset-4"
                      >
                        {loan.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {loan.author} · {loan.book_code}
                      </p>
                    </div>
                    <LoanBadge loan={loan} />
                  </div>

                  <p className="mt-3 text-sm">
                    <Link
                      href={`/members/${loan.member_id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {loan.member}
                    </Link>
                    <span className="text-xs text-gray-500">
                      {" "}
                      · {loan.member_code}
                    </span>
                  </p>

                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-gray-500">Borrowed</dt>
                      <dd>{loan.borrowed}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Due</dt>
                      <dd
                        className={
                          loan.overdue
                            ? "font-medium text-red-600 dark:text-red-400"
                            : ""
                        }
                      >
                        {loan.due}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Returned</dt>
                      <dd>{loan.returned ?? "Not yet"}</dd>
                    </div>
                  </dl>

                  <p className="mt-2 text-xs text-gray-500">
                    Loan #{loan.id} · {loan.duration_days} days
                    {loan.renewal_count > 0
                      ? ` · renewed ${loan.renewal_count}×`
                      : ""}
                  </p>

                  {canCirculate && (
                    <div className="mt-3">
                      <LoanActions
                        loanId={loan.id}
                        durationDays={loan.duration_days}
                        returned={Boolean(loan.returned)}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

function CirculationSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 rounded-lg border" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-64 rounded-lg border lg:col-span-2" />
        <div className="h-64 rounded-lg border" />
      </div>
      <div className="mt-8 h-80 rounded-lg border" />
    </div>
  );
}

export default async function CirculationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const user = await requirePagePermission("circulation.read");
  const canCirculate = hasPermission(user, "circulation.manage");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <LibraryBrand />
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Circulation</h1>
          <p className="mt-1 text-sm text-gray-500">
            {canCirculate
              ? "Issue books, renew loans and record returns."
              : "Review active, overdue and returned loans."}
          </p>
        </div>
        <AppNav current="circulation" />
      </header>

      <Suspense fallback={<CirculationSkeleton />}>
        <CirculationView
          searchParams={searchParams}
          canCirculate={canCirculate}
        />
      </Suspense>
    </main>
  );
}
