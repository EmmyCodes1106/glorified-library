import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { connection } from "next/server";
import sql from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getLendingSettings } from "@/lib/settings";
import AppNav from "../app-nav";
import LibraryBrand from "../library-brand";
import AddBookForm from "../add-book-form";
import AddMemberForm from "../members/add-member-form";
import QuickLoanForm from "./quick-loan-form";

export const metadata = {
  title: "Dashboard",
};

// every request needs the session cookie before any data is read
export const instant = false;

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-lg border p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

async function Statistics() {
  const [stats] = await sql`
    select
      (select coalesce(sum(total_copies), 0) from books)::int as total_copies,
      (select count(*) from loans where returned_on is null)::int as borrowed_books,
      (select count(*) from members)::int as total_members,
      (select count(*) from loans
        where returned_on is null and due_on < current_date)::int as overdue_books
  `;

  const availableBooks = Math.max(
    0,
    stats.total_copies - stats.borrowed_books
  );

  const cards = [
    {
      label: "Total books",
      value: stats.total_copies,
      hint: "Physical copies in stock",
      dot: "bg-gray-400",
      valueClass: "",
    },
    {
      label: "Available",
      value: availableBooks,
      hint: "Ready to lend",
      dot: "bg-green-600",
      valueClass: "text-green-600",
    },
    {
      label: "Borrowed",
      value: stats.borrowed_books,
      hint: "Currently on loan",
      dot: "bg-orange-500",
      valueClass: "text-orange-600",
    },
    {
      label: "Members",
      value: stats.total_members,
      hint: "Registered readers",
      dot: "bg-gray-400",
      valueClass: "",
    },
    {
      label: "Overdue",
      value: stats.overdue_books,
      hint: "Past their due date",
      dot: "bg-red-500",
      valueClass: stats.overdue_books > 0 ? "text-red-600" : "",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className={`h-2 w-2 rounded-full ${card.dot}`} />
            {card.label}
          </div>
          <p
            className={`mt-2 text-3xl font-semibold tabular-nums ${card.valueClass}`}
          >
            {card.value}
          </p>
          <p className="mt-1 text-xs text-gray-500">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}

async function MonthlyBorrowing() {
  const months = await sql`
    with months as (
      select generate_series(
        date_trunc('month', current_date) - interval '11 months',
        date_trunc('month', current_date),
        interval '1 month'
      ) as month
    )
    select
      to_char(m.month, 'YYYY-MM') as month_key,
      to_char(m.month, 'Mon') as label,
      to_char(m.month, 'Mon YYYY') as full_label,
      count(l.id)::int as borrows
    from months m
    left join loans l on date_trunc('month', l.borrowed_on) = m.month
    group by m.month
    order by m.month
  `;

  const total = months.reduce((sum, month) => sum + month.borrows, 0);
  const peak = Math.max(1, ...months.map((month) => month.borrows));

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Monthly borrowing</h2>
          <p className="text-sm text-gray-500">
            Loans recorded over the last 12 months
          </p>
        </div>
        <p className="shrink-0 text-sm text-gray-500">
          <span className="font-semibold text-foreground">{total}</span> total
        </p>
      </div>

      {total === 0 ? (
        <p className="mt-6 text-sm text-gray-500">
          No loans recorded in this period yet.
        </p>
      ) : (
        <div
          className="mt-6 flex items-end gap-1 sm:gap-2"
          role="img"
          aria-label={`Loans per month: ${months
            .map((month) => `${month.full_label}: ${month.borrows}`)
            .join(", ")}`}
        >
          {months.map((month) => (
            <div
              key={month.month_key}
              className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            >
              <span className="text-[10px] tabular-nums text-gray-500 sm:text-xs">
                {month.borrows > 0 ? month.borrows : ""}
              </span>
              <div className="flex h-28 w-full items-end sm:h-36">
                <div
                  className="w-full rounded-t bg-gray-900 dark:bg-gray-100"
                  style={{
                    height: `${Math.max(
                      (month.borrows / peak) * 100,
                      month.borrows > 0 ? 6 : 0
                    )}%`,
                  }}
                  title={`${month.full_label}: ${month.borrows} ${
                    month.borrows === 1 ? "loan" : "loans"
                  }`}
                />
              </div>
              <span className="w-full truncate text-center text-[10px] text-gray-500 sm:text-xs">
                {month.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

async function MostBorrowed() {
  const books = await sql`
    select
      b.id,
      b.title,
      a.name as author,
      count(l.id)::int as loans
    from books b
    join authors a on a.id = b.author_id
    join loans l on l.book_id = b.id
    group by b.id, b.title, a.name
    order by loans desc, b.title
    limit 5
  `;

  const peak = Math.max(1, ...books.map((book) => book.loans));

  return (
    <Card className="flex h-full flex-col">
      <div>
        <h2 className="font-semibold">Most borrowed</h2>
        <p className="text-sm text-gray-500">All-time lending by title</p>
      </div>

      {books.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">No loans recorded yet.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {books.map((book, index) => (
            <li key={book.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium">
                  <span className="mr-2 tabular-nums text-gray-500">
                    {index + 1}.
                  </span>
                  {book.title}
                </p>
                <span className="shrink-0 text-sm tabular-nums text-gray-500">
                  {book.loans} {book.loans === 1 ? "loan" : "loans"}
                </span>
              </div>
              <p className="truncate text-xs text-gray-500">{book.author}</p>
              <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-gray-900 dark:bg-gray-100"
                  style={{ width: `${(book.loans / peak) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

async function RecentActivity() {
  const events = await sql`
    select
      kind,
      to_char(happened_on, 'DD Mon YYYY') as happened,
      title,
      member,
      loan_id
    from (
      select
        l.id as loan_id,
        'borrowed' as kind,
        l.borrowed_on as happened_on,
        b.title,
        m.name as member
      from loans l
      join books b on b.id = l.book_id
      join members m on m.id = l.member_id
      union all
      select
        l.id,
        'returned',
        l.returned_on,
        b.title,
        m.name
      from loans l
      join books b on b.id = l.book_id
      join members m on m.id = l.member_id
      where l.returned_on is not null
    ) events
    order by happened_on desc, loan_id desc
    limit 8
  `;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Recent activity</h2>
          <p className="text-sm text-gray-500">Latest borrowing and returns</p>
        </div>
        <Link
          href="/"
          className="shrink-0 text-sm underline underline-offset-4"
        >
          Manage
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">No activity recorded yet.</p>
      ) : (
        <ul className="mt-4 divide-y">
          {events.map((event) => (
            <li
              key={`${event.loan_id}-${event.kind}`}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  event.kind === "borrowed" ? "bg-orange-500" : "bg-green-600"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <span className="font-medium">{event.title}</span>{" "}
                  <span className="text-gray-500">
                    {event.kind === "borrowed"
                      ? "borrowed by"
                      : "returned by"}{" "}
                    {event.member}
                  </span>
                </p>
                <p className="text-xs text-gray-500">{event.happened}</p>
              </div>
              <span
                className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] sm:inline ${
                  event.kind === "borrowed"
                    ? "text-orange-600"
                    : "text-green-600"
                }`}
              >
                {event.kind === "borrowed" ? "Borrowed" : "Returned"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function RecentlyAdded() {
  const books = await sql`
    select
      b.id,
      b.title,
      b.year,
      b.total_copies,
      a.name as author,
      coalesce(l.open_loans, 0)::int as open_loans
    from books b
    join authors a on a.id = b.author_id
    left join (
      select book_id, count(*)::int as open_loans
      from loans
      where returned_on is null
      group by book_id
    ) l on l.book_id = b.id
    order by b.id desc
    limit 5
  `;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Recently added</h2>
          <p className="text-sm text-gray-500">Newest catalogue entries</p>
        </div>
        <Link
          href="/"
          className="shrink-0 text-sm underline underline-offset-4"
        >
          View all
        </Link>
      </div>

      {books.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">No books in the library yet.</p>
      ) : (
        <ul className="mt-4 divide-y">
          {books.map((book) => (
            <li
              key={book.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{book.title}</p>
                <p className="truncate text-xs text-gray-500">
                  {book.author}
                  {book.year ? ` · ${book.year}` : ""}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                  book.total_copies - book.open_loans > 0
                    ? "text-green-600"
                    : "text-orange-600"
                }`}
              >
                {book.total_copies - book.open_loans > 0
                  ? `${book.total_copies - book.open_loans}/${
                      book.total_copies
                    } available`
                  : "All on loan"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function QuickActions({
  canAddBook,
  canAddMember,
  canLend,
}: {
  canAddBook: boolean;
  canAddMember: boolean;
  canLend: boolean;
}) {
  const [books, members, lending] = await Promise.all([
    sql`
      select b.id, b.title
      from books b
      where b.total_copies > (
        select count(*) from loans l
        where l.book_id = b.id and l.returned_on is null
      )
      order by b.title
    `,
    sql`select id, name from members where status = 'active' order by name`,
    getLendingSettings(),
  ]);

  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
      {canAddBook && <AddBookForm />}
      {canAddMember && (
        <AddMemberForm
          defaultLimit={lending.defaultMemberLimit}
          maxLimit={lending.maxMemberLimit}
          membershipMonths={lending.membershipMonths}
        />
      )}
      {canLend && (
        <QuickLoanForm
          books={books.map((book) => ({
            id: Number(book.id),
            title: String(book.title),
          }))}
          members={members.map((member) => ({
            id: Number(member.id),
            name: String(member.name),
          }))}
          defaultLoanDays={lending.defaultLoanDays}
        />
      )}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
      aria-hidden="true"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-lg border p-4 sm:p-5"
        >
          <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-3 h-8 w-12 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-2 h-2.5 w-24 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
      ))}
    </div>
  );
}

function PanelSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg border p-5 ${className}`}
      aria-hidden="true"
    >
      <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-800" />
      <div className="mt-4 h-40 rounded bg-gray-100 dark:bg-gray-800" />
    </div>
  );
}

export default async function DashboardPage() {
  await connection();
  const user = await requireUser();
  const canAddBook = hasPermission(user, "books.manage");
  const canAddMember = hasPermission(user, "members.manage");
  const canLend = hasPermission(user, "circulation.manage");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <LibraryBrand />
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            Admin dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Live view of your catalogue, members and lending.
          </p>
        </div>
        <AppNav current="dashboard" />
      </header>

      <div className="space-y-6">
        <Suspense fallback={<StatSkeleton />}>
          <Statistics />
        </Suspense>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <Suspense fallback={<PanelSkeleton />}>
              <MonthlyBorrowing />
            </Suspense>
          </div>
          <Suspense fallback={<PanelSkeleton />}>
            <MostBorrowed />
          </Suspense>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<PanelSkeleton />}>
            <RecentActivity />
          </Suspense>
          <Suspense fallback={<PanelSkeleton />}>
            <RecentlyAdded />
          </Suspense>
        </div>

        <section aria-labelledby="quick-actions-heading">
          <div className="mb-4">
            <h2 id="quick-actions-heading" className="text-lg font-semibold">
              Quick actions
            </h2>
            <p className="text-sm text-gray-500">
              Add stock, register readers, or record a loan without leaving the
              dashboard.
            </p>
          </div>
          <Suspense
            fallback={
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <PanelSkeleton />
                <PanelSkeleton />
                <PanelSkeleton />
              </div>
            }
          >
            <QuickActions
              canAddBook={canAddBook}
              canAddMember={canAddMember}
              canLend={canLend}
            />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
