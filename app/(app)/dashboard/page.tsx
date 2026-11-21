import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BookCheck,
  BookOpen,
  KeyRound,
  Library,
  Users,
} from "lucide-react";
import sql from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getLendingSettings } from "@/lib/settings";
import AddBookForm from "@/components/add-book-form";
import AddMemberForm from "../members/add-member-form";
import QuickLoanForm from "./quick-loan-form";
import { EmptyState, PageIntro, SectionHeader, StatCard } from "@/components/ui";

export const metadata = {
  title: "Dashboard",
};

// every request needs the session cookie before any data is read
export const instant = false;

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

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        label="Total books"
        value={stats.total_copies}
        hint="Physical copies in stock"
        icon={Library}
        tone="brand"
      />
      <StatCard
        label="Available"
        value={availableBooks}
        hint="Ready to lend"
        icon={BookCheck}
        tone="success"
      />
      <StatCard
        label="Borrowed"
        value={stats.borrowed_books}
        hint="Currently on loan"
        icon={BookOpen}
        tone="warning"
      />
      <StatCard
        label="Members"
        value={stats.total_members}
        hint="Registered readers"
        icon={Users}
        tone="neutral"
      />
      <StatCard
        label="Overdue"
        value={stats.overdue_books}
        hint="Past their due date"
        icon={AlertTriangle}
        tone="danger"
      />
    </div>
  );
}

type PasswordRequestRow = {
  member_id: number;
  name: string;
  code: string;
  requested: string;
  note: string | null;
};

async function PasswordRequests() {
  const requests = await sql<PasswordRequestRow[]>`
    select
      pr.member_id,
      m.name,
      m.member_code as code,
      to_char(pr.requested_at, 'DD Mon YYYY HH24:MI') as requested,
      pr.note
    from member_password_requests pr
    join members m on m.id = pr.member_id
    where pr.status = 'pending'
    order by pr.requested_at
  `;

  return (
    <section aria-labelledby="password-requests-heading">
      <div className="mb-4">
        <SectionHeader
          id="password-requests-heading"
          title="Member password requests"
          description="Members waiting for a staff-issued temporary portal password."
          action={
            <span
              className={`badge ${
                requests.length > 0 ? "badge-warning" : "badge-neutral"
              }`}
            >
              {requests.length} pending
            </span>
          }
        />
      </div>
      <div className="card p-5">
        {requests.length === 0 ? (
          <p className="text-sm text-muted">
            No one is waiting for a staff-issued temporary password. Members
            now reset their own passwords with an emailed code.
          </p>
        ) : (
          <ul className="divide-y">
            {requests.map((request) => (
              <li
                key={request.member_id}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {request.name}
                    <span className="badge badge-neutral">{request.code}</span>
                  </p>
                  <p className="text-xs text-muted">
                    Requested {request.requested}
                  </p>
                  {request.note && (
                    <p className="mt-1 whitespace-pre-line break-words text-xs text-muted">
                      “{request.note}”
                    </p>
                  )}
                </div>
                <Link
                  href={`/members/${request.member_id}`}
                  className="btn btn-sm btn-primary"
                >
                  <KeyRound size={14} aria-hidden="true" />
                  Set password
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

type MonthBar = {
  month_key: string;
  label: string;
  full_label: string;
  borrows: number;
};

async function MonthlyBorrowing() {
  const months = await sql<MonthBar[]>`
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
    <div className="card flex h-full flex-col p-5">
      <SectionHeader
        title="Monthly borrowing"
        description="Loans recorded over the last 12 months"
        action={
          <p className="text-sm text-muted">
            <span className="font-semibold text-foreground">{total}</span> total
          </p>
        }
      />

      {total === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={BookOpen}
            title="No loans in this period"
            description="Issue a book from the circulation desk and monthly activity will appear here."
          />
        </div>
      ) : (
        <div
          className="mt-6 flex flex-1 items-end gap-1 sm:gap-2"
          role="img"
          aria-label={`Loans per month: ${months
            .map((month) => `${month.full_label}: ${month.borrows}`)
            .join(", ")}`}
        >
          {months.map((month) => (
            <div
              key={month.month_key}
              className="group flex min-w-0 flex-1 flex-col items-center gap-1.5"
            >
              <span className="text-[10px] tabular-nums text-muted sm:text-xs">
                {month.borrows > 0 ? month.borrows : ""}
              </span>
              <div className="flex h-28 w-full items-end sm:h-36">
                <div
                  className="w-full rounded-t-md bg-brand transition-colors group-hover:bg-brand-hover"
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
              <span className="w-full truncate text-center text-[10px] text-muted sm:text-xs">
                {month.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function MostBorrowed() {
  const books = await sql<{ id: number; title: string; author: string; loans: number }[]>`
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
    <div className="card flex h-full flex-col p-5">
      <SectionHeader
        title="Most borrowed"
        description="All-time lending by title"
      />

      {books.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={BookOpen}
            title="No lending history"
            description="Your most borrowed titles will rank here once loans are recorded."
          />
        </div>
      ) : (
        <ol className="mt-5 flex flex-1 flex-col justify-between gap-4">
          {books.map((book, index) => (
            <li key={book.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium">
                  <span className="mr-2 tabular-nums text-muted">
                    {index + 1}.
                  </span>
                  {book.title}
                </p>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {book.loans} {book.loans === 1 ? "loan" : "loans"}
                </span>
              </div>
              <p className="truncate text-xs text-muted">{book.author}</p>
              <div className="mt-1.5 h-1.5 rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${(book.loans / peak) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

type ActivityEvent = {
  kind: "borrowed" | "returned";
  happened: string;
  title: string;
  member: string;
  loan_id: number;
};

async function RecentActivity() {
  const events = await sql<ActivityEvent[]>`
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
    <div className="card flex h-full flex-col p-5">
      <SectionHeader
        title="Recent activity"
        description="Latest borrowing and returns"
        action={
          <Link href="/" className="text-sm font-medium text-brand hover:underline">
            Manage
          </Link>
        }
      />

      {events.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={ArrowLeftRight}
            title="No activity yet"
            description="Borrowing and return events will show up here as they happen."
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y">
          {events.map((event) => {
            const borrowed = event.kind === "borrowed";
            return (
              <li
                key={`${event.loan_id}-${event.kind}`}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    borrowed
                      ? "bg-warning-soft text-warning"
                      : "bg-success-soft text-success"
                  }`}
                  aria-hidden="true"
                >
                  {borrowed ? (
                    <ArrowUpRight size={14} strokeWidth={2.5} />
                  ) : (
                    <ArrowDownLeft size={14} strokeWidth={2.5} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-medium">{event.title}</span>{" "}
                    <span className="text-muted">
                      {borrowed ? "borrowed by" : "returned by"} {event.member}
                    </span>
                  </p>
                  <p className="text-xs text-muted">{event.happened}</p>
                </div>
                <span
                  className={`badge hidden shrink-0 sm:inline-flex ${
                    borrowed ? "badge-warning" : "badge-success"
                  }`}
                >
                  {borrowed ? "Borrowed" : "Returned"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function RecentlyAdded() {
  const books = await sql<
    {
      id: number;
      title: string;
      year: number | null;
      total_copies: number;
      author: string;
      open_loans: number;
    }[]
  >`
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
    <div className="card flex h-full flex-col p-5">
      <SectionHeader
        title="Recently added"
        description="Newest catalogue entries"
        action={
          <Link
            href="/"
            className="text-sm font-medium text-brand hover:underline"
          >
            View all
          </Link>
        }
      />

      {books.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={Library}
            title="Catalogue is empty"
            description="Add your first title to start building the collection."
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y">
          {books.map((book) => {
            const available = book.total_copies - book.open_loans;
            return (
              <li
                key={book.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{book.title}</p>
                  <p className="truncate text-xs text-muted">
                    {book.author}
                    {book.year ? ` · ${book.year}` : ""}
                  </p>
                </div>
                <span
                  className={`badge shrink-0 ${
                    available > 0 ? "badge-success" : "badge-warning"
                  }`}
                >
                  {available > 0
                    ? `${available}/${book.total_copies} available`
                    : "All on loan"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
    sql<{ id: number; title: string }[]>`
      select b.id, b.title
      from books b
      where b.total_copies > (
        select count(*) from loans l
        where l.book_id = b.id and l.returned_on is null
      )
      order by b.title
    `,
    sql<{ id: number; name: string }[]>`
      select id, name from members where status = 'active' order by name
    `,
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
            id: book.id,
            title: book.title,
          }))}
          members={members.map((member) => ({
            id: member.id,
            name: member.name,
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
        <div key={index} className="card p-5">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton mt-3 h-7 w-12" />
          <div className="skeleton mt-2 h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

function PanelSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`card p-5 ${className}`} aria-hidden="true">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton mt-4 h-40" />
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
    <div className="space-y-8">
      <PageIntro>
        Welcome back, {user.name.split(" ")[0]}. Here is today&apos;s view of
        your catalogue, members and lending.
      </PageIntro>

      <div className="space-y-6">
        <Suspense fallback={<StatSkeleton />}>
          <Statistics />
        </Suspense>

        {user.role === "super_admin" && (
          <Suspense fallback={<PanelSkeleton />}>
            <PasswordRequests />
          </Suspense>
        )}

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
            <SectionHeader
              id="quick-actions-heading"
              title="Quick actions"
              description="Add stock, register readers, or record a loan without leaving the dashboard."
            />
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
    </div>
  );
}
