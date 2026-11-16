import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  AlertTriangle,
  BookOpen,
  Library,
  RotateCcw,
  Search,
} from "lucide-react";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import LoanActions from "@/components/loan-actions";
import { EmptyState, PageIntro, SectionHeader, StatCard } from "@/components/ui";
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
  due_iso: string;
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

function LoanBadge({ loan }: { loan: LoanRow }) {
  if (loan.returned) {
    return <span className="badge badge-success">Returned</span>;
  }
  if (loan.overdue) {
    return <span className="badge badge-danger">Overdue</span>;
  }
  return <span className="badge badge-warning">Active</span>;
}

const VIEW_LABELS: Record<LoanView, string> = {
  all: "All",
  active: "Active",
  overdue: "Overdue",
  returned: "Returned",
};

export async function CirculationView({
  searchParams,
  canCirculate,
  basePath = "/circulation",
}: {
  searchParams: SearchParams;
  canCirculate: boolean;
  basePath?: string;
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
    sql<{ default_loan_days: number; today: string; default_due: string }[]>`
      select
        default_loan_days,
        to_char(current_date, 'YYYY-MM-DD') as today,
        to_char(current_date + default_loan_days, 'YYYY-MM-DD') as default_due
      from circulation_settings where id
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
        to_char(l.due_on, 'YYYY-MM-DD') as due_iso,
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
  const today = settings[0]?.today ?? new Date().toISOString().slice(0, 10);
  const defaultDueDate =
    settings[0]?.default_due ??
    new Date(
      Date.parse(`${today}T00:00:00Z`) + defaultLoanDays * 86_400_000
    )
      .toISOString()
      .slice(0, 10);

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
    return `${basePath}?${query.toString()}`;
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active loans"
          value={stats.active}
          hint="Open and not overdue"
          icon={BookOpen}
          tone="warning"
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          hint="Open loans past due"
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Returned"
          value={stats.returned}
          hint="Completed loans on record"
          icon={RotateCcw}
          tone="success"
        />
        <StatCard
          label="Available copies"
          value={stats.available}
          hint="Ready to issue"
          icon={Library}
          tone="brand"
        />
      </div>

      {canCirculate && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
            today={today}
            defaultDueDate={defaultDueDate}
          />
          <SettingsForm defaultLoanDays={defaultLoanDays} />
        </div>
      )}

      <section aria-labelledby="loans-heading">
        <SectionHeader
          id="loans-heading"
          title="Loans"
          description="Active, overdue and returned records, newest first for returns."
          action={
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">
                {loans.length}
              </span>{" "}
              shown
            </p>
          }
        />

        <nav aria-label="Loan status" className="mt-3 flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const current = status === tab.value;
            return (
              <Link
                key={tab.value}
                href={tabHref(tab.value)}
                aria-current={current ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  current
                    ? "border-brand bg-brand text-on-brand"
                    : "border-line bg-surface text-muted-strong hover:border-line-strong hover:text-foreground"
                }`}
              >
                {VIEW_LABELS[tab.value]}
                <span
                  className={`tabular-nums ${
                    current ? "text-on-brand/75" : "text-muted"
                  }`}
                >
                  {tab.count}
                </span>
              </Link>
            );
          })}
        </nav>

        <form
          method="get"
          role="search"
          className="card mt-3 flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="status" value={status} />
          <label className="grid flex-1 gap-1">
            <span className="label">Search loans</span>
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Member, book, ISBN, member ID or loan number"
              className="field w-full"
            />
          </label>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary">
              <Search size={15} strokeWidth={2.25} aria-hidden="true" />
              Search
            </button>
            {q && (
              <Link
                href={`${basePath}?status=${status}`}
                className="text-sm font-medium text-muted hover:text-foreground hover:underline"
              >
                Clear
              </Link>
            )}
          </div>
        </form>

        {loans.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={RotateCcw}
              title={`No ${VIEW_LABELS[status].toLowerCase()} loans`}
              description={emptyMessage}
            />
          </div>
        ) : (
          <>
            <div className="table-wrap mt-4 hidden md:block">
              <div className="overflow-x-auto">
                <table className="data-table min-w-[880px]">
                  <thead>
                    <tr>
                      <th scope="col">Book</th>
                      <th scope="col">Member</th>
                      <th scope="col">Dates</th>
                      <th scope="col">Term</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((loan) => (
                      <tr key={loan.id}>
                        <td>
                          <Link
                            href={`/?q=${encodeURIComponent(loan.book_code)}`}
                            className="font-medium text-foreground hover:text-brand hover:underline"
                          >
                            {loan.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted">
                            {loan.author} · {loan.book_code}
                          </p>
                          <p className="text-xs text-muted">Loan #{loan.id}</p>
                        </td>
                        <td>
                          <Link
                            href={`/members/${loan.member_id}`}
                            className="font-medium text-foreground hover:text-brand hover:underline"
                          >
                            {loan.member}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted">
                            {loan.member_code}
                          </p>
                        </td>
                        <td>
                          <dl className="grid gap-0.5 text-xs">
                            <div className="flex gap-1">
                              <dt className="text-muted">Borrowed</dt>
                              <dd>{loan.borrowed}</dd>
                            </div>
                            <div className="flex gap-1">
                              <dt className="text-muted">Due</dt>
                              <dd
                                className={
                                  loan.overdue ? "font-medium text-danger" : ""
                                }
                              >
                                {loan.due}
                              </dd>
                            </div>
                            <div className="flex gap-1">
                              <dt className="text-muted">Returned</dt>
                              <dd>{loan.returned ?? "Not yet"}</dd>
                            </div>
                          </dl>
                        </td>
                        <td className="text-xs">
                          <p>{loan.duration_days} days</p>
                          {loan.renewal_count > 0 && (
                            <p className="text-muted">
                              Renewed {loan.renewal_count}×
                            </p>
                          )}
                        </td>
                        <td>
                          <LoanBadge loan={loan} />
                        </td>
                        <td>
                          {canCirculate ? (
                            <LoanActions
                              loanId={loan.id}
                              durationDays={loan.duration_days}
                              dueDate={loan.due_iso}
                              returned={Boolean(loan.returned)}
                            />
                          ) : (
                            <span className="badge badge-neutral">Read-only</span>
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
                <li key={loan.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/?q=${encodeURIComponent(loan.book_code)}`}
                        className="break-words font-medium hover:text-brand hover:underline"
                      >
                        {loan.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {loan.author} · {loan.book_code}
                      </p>
                    </div>
                    <LoanBadge loan={loan} />
                  </div>

                  <p className="mt-3 text-sm">
                    <Link
                      href={`/members/${loan.member_id}`}
                      className="font-medium hover:text-brand hover:underline"
                    >
                      {loan.member}
                    </Link>
                    <span className="text-xs text-muted">
                      {" "}
                      · {loan.member_code}
                    </span>
                  </p>

                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-muted">Borrowed</dt>
                      <dd>{loan.borrowed}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Due</dt>
                      <dd
                        className={loan.overdue ? "font-medium text-danger" : ""}
                      >
                        {loan.due}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Returned</dt>
                      <dd>{loan.returned ?? "Not yet"}</dd>
                    </div>
                  </dl>

                  <p className="mt-2 text-xs text-muted">
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
                        dueDate={loan.due_iso}
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
    </div>
  );
}

export function CirculationSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card h-64 lg:col-span-2" />
        <div className="card h-64" />
      </div>
      <div className="card h-80" />
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
    <div className="space-y-6">
      <PageIntro>
        {canCirculate
          ? "Issue books, renew loans and record returns."
          : "Review active, overdue and returned loans."}
      </PageIntro>

      <Suspense fallback={<CirculationSkeleton />}>
        <CirculationView
          searchParams={searchParams}
          canCirculate={canCirculate}
        />
      </Suspense>
    </div>
  );
}
