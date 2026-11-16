import { Suspense } from "react";
import { connection } from "next/server";
import { History } from "lucide-react";
import { requireMember } from "@/lib/member-auth/dal";
import { getLoanHistory } from "@/lib/member-portal";
import { EmptyState, PageIntro } from "@/components/ui";
import { LoanStatusBadge } from "@/components/member-status";

export const metadata = {
  title: "Borrowing history",
};

// every request needs the member session cookie before any data is read
export const instant = false;

function HistorySkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="skeleton h-8 w-56" />
      <div className="card h-96" />
    </div>
  );
}

async function HistoryView() {
  const member = await requireMember();
  const loans = await getLoanHistory(member.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Borrowing history
          </h2>
          <p className="mt-1 text-sm text-muted">
            Every loan and return on your record, newest first.
          </p>
        </div>
        <span className="badge badge-neutral">{loans.length} total</span>
      </div>

      <section className="card p-5" aria-labelledby="history-heading">
        <h3 id="history-heading" className="font-semibold">
          All activity
        </h3>

        {loans.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={History}
              title="No borrowing history yet"
              description="Loans and returns will appear here after your first visit to the library."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {loans.map((loan) => (
              <li key={loan.id} className="py-4 first:pt-2 last:pb-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{loan.title}</p>
                    <p className="text-xs text-muted">
                      {loan.author} · {loan.book_code}
                    </p>
                  </div>
                  <LoanStatusBadge
                    returned={Boolean(loan.returned)}
                    overdue={loan.overdue}
                  />
                </div>

                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted">Borrowed</dt>
                    <dd>{loan.borrowed}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Due</dt>
                    <dd className={loan.overdue ? "font-medium text-danger" : ""}>
                      {loan.due}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Returned</dt>
                    <dd>{loan.returned ?? "Not yet"}</dd>
                  </div>
                </dl>
                {loan.renewal_count > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    {loan.duration_days}-day term · renewed{" "}
                    {loan.renewal_count}×
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default async function MemberHistoryPage() {
  await connection();

  return (
    <div className="space-y-6">
      <PageIntro>
        A complete record of the books you have borrowed and returned.
      </PageIntro>
      <Suspense fallback={<HistorySkeleton />}>
        <HistoryView />
      </Suspense>
    </div>
  );
}
