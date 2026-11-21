import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BookOpen } from "lucide-react";
import { requireMember } from "@/lib/member-auth/dal";
import { getOpenLoans } from "@/lib/member-portal";
import { EmptyState, Notice, PageIntro } from "@/components/ui";
import { LoanStatusBadge } from "@/components/member-status";
import MemberLoanActions from "@/components/member-loan-actions";

export const metadata = {
  title: "My loans",
};

// every request needs the member session cookie before any data is read
export const instant = false;

function LoansSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="skeleton h-8 w-48" />
      <div className="card h-72" />
    </div>
  );
}

async function OpenLoansView() {
  const member = await requireMember();
  const loans = await getOpenLoans(member.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">My loans</h2>
          <p className="mt-1 text-sm text-muted">
            Books you have out now. You can renew anything that is not overdue.
          </p>
        </div>
        <span className="badge badge-neutral">
          {loans.length} of {member.loanLimit} allowed
        </span>
      </div>

      <Notice>
        A renewal extends the loan by its original term. Overdue loans cannot
        be renewed online, and the library desk can help with those.
      </Notice>

      <section className="card p-5" aria-labelledby="open-loans-heading">
        <h3 id="open-loans-heading" className="font-semibold">
          Currently borrowed
        </h3>

        {loans.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={BookOpen}
              title="No books on loan"
              description="When you borrow from the library, the book and its due date will appear here."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {loans.map((loan) => (
              <li
                key={loan.id}
                className="flex flex-col gap-3 py-4 first:pt-2 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words font-medium">{loan.title}</p>
                    <LoanStatusBadge
                      returned={false}
                      overdue={loan.overdue}
                    />
                  </div>
                  <p className="text-xs text-muted">
                    {loan.author} · {loan.book_code}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Borrowed {loan.borrowed} · Due{" "}
                    <span
                      className={loan.overdue ? "font-medium text-danger" : ""}
                    >
                      {loan.due}
                    </span>{" "}
                    · {loan.duration_days}-day term
                    {loan.renewal_count > 0
                      ? ` · Renewed ${loan.renewal_count}×`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {loan.has_ebook && member.status === "active" && (
                    <Link
                      href={`/member/read/${loan.book_id}`}
                      className="btn btn-sm btn-primary"
                    >
                      Read online
                    </Link>
                  )}
                  <MemberLoanActions
                    loanId={loan.id}
                    overdue={loan.overdue}
                    disabled={member.status !== "active"}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default async function MemberLoansPage() {
  await connection();

  return (
    <div className="space-y-6">
      <PageIntro>
        Your current borrowing, with due dates and renewal options.
      </PageIntro>
      <Suspense fallback={<LoansSkeleton />}>
        <OpenLoansView />
      </Suspense>
    </div>
  );
}
