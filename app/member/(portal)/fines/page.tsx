import { Suspense } from "react";
import { connection } from "next/server";
import sql from "@/db";
import {
  HandCoins,
  ReceiptText,
  Scale,
  Wallet,
} from "lucide-react";
import { requireMember } from "@/lib/member-auth/dal";
import {
  getMemberFineLedger,
  getMemberFineLoans,
  getMemberFineSettings,
  getMemberFineStats,
  type MemberFineLoan,
} from "@/lib/member-portal";
import { formatMoney } from "@/lib/settings";
import { EmptyState, Notice, PageIntro, StatCard } from "@/components/ui";

export const metadata = {
  title: "Fines and balance",
};

// every request needs the member session cookie before any data is read
export const instant = false;

function money(value: string | number, currency = "") {
  return formatMoney(value, currency);
}

function toCents(value: string | number) {
  return Math.round(Number(value ?? 0) * 100);
}

function FineBadge({ loan }: { loan: MemberFineLoan }) {
  const charged = toCents(loan.charged);
  const paid = toCents(loan.paid);
  const waived = toCents(loan.waived);
  const balance = charged - paid - waived;

  let label = "No fine";
  let classes = "badge-neutral";

  if (charged > 0) {
    if (balance <= 0) {
      label = waived > 0 && paid === 0 ? "Waived" : "Paid";
      classes = label === "Waived" ? "badge-info" : "badge-success";
    } else if (paid + waived > 0) {
      label = "Partial";
      classes = "badge-warning";
    } else {
      label = "Unpaid";
      classes = "badge-danger";
    }
  }

  return <span className={`badge ${classes}`}>{label}</span>;
}

function FinesSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card h-24" />
        ))}
      </div>
      <div className="card h-72" />
      <div className="card h-56" />
    </div>
  );
}

async function FinesView() {
  const member = await requireMember();

  // materialise any newly overdue days before reading balances
  await sql`select accrue_fines()`;

  const [settings, stats, loans, ledger] = await Promise.all([
    getMemberFineSettings(),
    getMemberFineStats(member.id),
    getMemberFineLoans(member.id),
    getMemberFineLedger(member.id),
  ]);

  const currency = settings?.currency_symbol ?? "";
  const fineEnabled = Boolean(settings?.fine_enabled);
  const finePerDay = settings?.fine_per_day ?? "0.00";
  const graceDays = settings?.fine_grace_days ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Fines and balance
        </h2>
        <p className="mt-1 text-sm text-muted">
          Charges for late returns and any payments or waivers on your account.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={money(stats.outstanding, currency)}
          hint="Unpaid and partially paid fines"
          icon={Wallet}
          tone="warning"
        />
        <StatCard
          label="Charged"
          value={money(stats.charged, currency)}
          hint="Late-return charges on record"
          icon={ReceiptText}
          tone="neutral"
        />
        <StatCard
          label="Paid"
          value={money(stats.paid, currency)}
          hint="Payments recorded by staff"
          icon={HandCoins}
          tone="success"
        />
        <StatCard
          label="Waived"
          value={money(stats.waived, currency)}
          hint="Fines waived by the library"
          icon={Scale}
          tone="neutral"
        />
      </div>

      {fineEnabled ? (
        <Notice>
          Fines are charged at {money(finePerDay, currency)} for each overdue
          day
          {graceDays > 0
            ? `, starting ${graceDays} ${
                graceDays === 1 ? "day" : "days"
              } after the due date`
            : ""}
          .
        </Notice>
      ) : (
        <Notice tone="info">
          Fines are not currently being charged. Any amounts shown below are
          from earlier charges on your account.
        </Notice>
      )}

      <section className="card p-5" aria-labelledby="charges-heading">
        <h3 id="charges-heading" className="font-semibold">
          Charges
        </h3>
        <p className="mt-1 text-sm text-muted">
          Late returns with an amount charged or still owed.
        </p>

        {loans.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={ReceiptText}
              title="No fines on record"
              description="Return every book by its due date and no late charges will appear."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {loans.map((loan) => (
              <li key={loan.loan_id} className="py-4 first:pt-2 last:pb-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{loan.title}</p>
                    <p className="text-xs text-muted">
                      {loan.author} · {loan.book_code}
                    </p>
                  </div>
                  <FineBadge loan={loan} />
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-muted">Borrowed</dt>
                    <dd>{loan.borrowed}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Due</dt>
                    <dd>{loan.due}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Returned</dt>
                    <dd>{loan.returned ?? "Not yet"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Days late</dt>
                    <dd>{loan.days_overdue}</dd>
                  </div>
                </dl>

                <dl className="mt-2 grid grid-cols-2 gap-1 text-xs tabular-nums sm:grid-cols-4">
                  <div>
                    <dt className="text-muted">Charged</dt>
                    <dd>{money(loan.charged, currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Paid</dt>
                    <dd>{money(loan.paid, currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Waived</dt>
                    <dd>{money(loan.waived, currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Outstanding</dt>
                    <dd className="font-medium">
                      {money(loan.balance, currency)}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5" aria-labelledby="payments-heading">
        <h3 id="payments-heading" className="font-semibold">
          Payments and waivers
        </h3>
        <p className="mt-1 text-sm text-muted">
          Recorded by library staff, newest first.
        </p>

        {ledger.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={HandCoins}
              title="No payments or waivers"
              description="Anything the library records against your fines will appear here."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {ledger.map((entry) => (
              <li key={entry.id} className="py-3 first:pt-2 last:pb-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">
                      {money(entry.amount, currency)}
                    </p>
                    <p className="text-xs text-muted">
                      {entry.title} · {entry.book_code}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`badge capitalize ${
                        entry.kind === "payment"
                          ? "badge-success"
                          : "badge-info"
                      }`}
                    >
                      {entry.kind}
                    </span>
                    <p className="mt-1 text-xs text-muted">{entry.recorded}</p>
                  </div>
                </div>
                {entry.reason && (
                  <p className="mt-1 break-words text-xs text-muted">
                    {entry.reason}
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

export default async function MemberFinesPage() {
  await connection();

  return (
    <div className="space-y-6">
      <PageIntro>
        Your late-return charges and the payments recorded against them.
      </PageIntro>
      <Suspense fallback={<FinesSkeleton />}>
        <FinesView />
      </Suspense>
    </div>
  );
}
