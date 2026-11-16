import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import sql from "@/db";
import { requireMember } from "@/lib/member-auth/dal";
import {
  getLoanHistory,
  getMemberFineSettings,
  getMemberFineStats,
  getOpenLoans,
  getPortalMember,
} from "@/lib/member-portal";
import { formatMoney } from "@/lib/settings";
import { AlertTriangle, BookOpen, History, Wallet } from "lucide-react";
import { EmptyState, SectionHeader, StatCard } from "@/components/ui";
import { LoanStatusBadge, MemberStatusBadge } from "@/components/member-status";
import MemberLoanActions from "@/components/member-loan-actions";

export const metadata = {
  title: "Overview",
};

// every request needs the member session cookie before any data is read
export const instant = false;

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="skeleton h-8 w-64 max-w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card h-80" />
        <div className="card h-80" />
      </div>
    </div>
  );
}

async function Overview() {
  const session = await requireMember();
  await sql`select accrue_fines()`;

  const [member, loans, recent, loanCount, fineSettings, fineStats] =
    await Promise.all([
      getPortalMember(session.id),
      getOpenLoans(session.id),
      getLoanHistory(session.id, 5),
      sql<{ count: number }[]>`
        select count(*)::int as count from loans where member_id = ${session.id}
      `,
      getMemberFineSettings(),
      getMemberFineStats(session.id),
    ]);

  if (!member) return null;

  const currency = fineSettings?.currency_symbol ?? "";
  const overdue = loans.filter((loan) => loan.overdue).length;
  const totalLoans = loanCount[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="break-words text-2xl font-semibold tracking-tight">
            Welcome back, {member.name}
          </h2>
          <MemberStatusBadge status={member.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {member.member_code} · Member since {member.joined}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="On loan"
          value={loans.length}
          hint={`Of ${member.loan_limit} books allowed`}
          icon={BookOpen}
          tone="brand"
        />
        <StatCard
          label="Overdue"
          value={overdue}
          hint="Open loans past due"
          icon={AlertTriangle}
          tone={overdue > 0 ? "danger" : "success"}
        />
        <StatCard
          label="Outstanding fines"
          value={formatMoney(fineStats.outstanding, currency)}
          hint={
            fineSettings?.fine_enabled
              ? "Unpaid and partially paid fines"
              : "Fines are currently turned off"
          }
          icon={Wallet}
          tone="warning"
        />
        <StatCard
          label="Books borrowed"
          value={totalLoans}
          hint="Loans on your record"
          icon={History}
          tone="neutral"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card p-5" aria-labelledby="current-loans-heading">
          <SectionHeader
            id="current-loans-heading"
            title="Current loans"
            description="Books you have out now, with their due dates."
            action={
              <Link
                href="/member/loans"
                className="text-sm font-medium text-brand underline-offset-4 hover:underline"
              >
                View all
              </Link>
            }
          />

          {loans.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={BookOpen}
                title="No books on loan"
                description="Visit the library to borrow your next book."
              />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {loans.map((loan) => (
                <li
                  key={loan.id}
                  className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{loan.title}</p>
                    <p className="text-xs text-muted">
                      {loan.author} · {loan.book_code}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Borrowed {loan.borrowed} · Due{" "}
                      <span
                        className={
                          loan.overdue ? "font-medium text-danger" : ""
                        }
                      >
                        {loan.due}
                      </span>
                      {loan.renewal_count > 0
                        ? ` · Renewed ${loan.renewal_count}×`
                        : ""}
                    </p>
                  </div>
                  <MemberLoanActions
                    loanId={loan.id}
                    overdue={loan.overdue}
                    disabled={member.status !== "active"}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="min-w-0 space-y-6">
          <section className="card p-5" aria-labelledby="membership-heading">
            <h2 id="membership-heading" className="font-semibold">
              Membership
            </h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Member ID</dt>
                <dd className="font-medium">{member.member_code}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Status</dt>
                <dd className="mt-1">
                  <MemberStatusBadge status={member.status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Membership expiry</dt>
                <dd
                  className={
                    member.status === "expired"
                      ? "font-medium text-danger"
                      : ""
                  }
                >
                  {member.expires ?? "No expiry"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Borrowing limit</dt>
                <dd>
                  {member.loan_limit}{" "}
                  {member.loan_limit === 1 ? "book" : "books"} at a time
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Last portal sign-in</dt>
                <dd>{member.portal_last_login ?? "First visit"}</dd>
              </div>
            </dl>
            <Link
              href="/member/profile"
              className="mt-4 inline-flex text-sm font-medium text-brand underline-offset-4 hover:underline"
            >
              View and update profile
            </Link>
          </section>

          <section className="card p-5" aria-labelledby="recent-heading">
            <div className="flex items-start justify-between gap-3">
              <h2 id="recent-heading" className="font-semibold">
                Recent borrowing
              </h2>
              <Link
                href="/member/history"
                className="text-sm font-medium text-brand underline-offset-4 hover:underline"
              >
                All
              </Link>
            </div>

            {recent.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No borrowing activity yet.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {recent.map((loan) => (
                  <li key={loan.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {loan.title}
                        </p>
                        <p className="text-xs text-muted">
                          {loan.returned
                            ? `Returned ${loan.returned}`
                            : `Due ${loan.due}`}
                        </p>
                      </div>
                      <LoanStatusBadge
                        returned={Boolean(loan.returned)}
                        overdue={loan.overdue}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default async function MemberOverviewPage() {
  await connection();

  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview />
    </Suspense>
  );
}
