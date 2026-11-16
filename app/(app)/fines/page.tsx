import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  AlertTriangle,
  HandCoins,
  ReceiptText,
  Scale,
  Wallet,
} from "lucide-react";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/settings";
import {
  EmptyState,
  PageIntro,
  SectionHeader,
  StatCard,
} from "@/components/ui";
import FineActions from "./fine-actions";
import FinePolicyForm from "./fine-policy-form";

export const metadata = {
  title: "Fines",
};

// every request needs the session cookie before any data is read
export const instant = false;

type FineSettings = {
  fine_enabled: boolean;
  fine_per_day: string;
  fine_grace_days: number;
  currency_symbol: string;
  today: string;
};

type FineLoan = {
  loan_id: number;
  member_id: number;
  member: string;
  member_code: string;
  email: string | null;
  phone: string | null;
  book_id: number;
  book_code: string;
  title: string;
  author: string;
  borrowed: string;
  due: string;
  returned: string | null;
  days_overdue: number;
  charged: string;
  paid: string;
  waived: string;
  balance: string;
};

type FineStats = {
  overdue: number;
  outstanding: string;
  collected: string;
  waived: string;
};

type LedgerRow = {
  id: number;
  kind: "payment" | "waiver";
  amount: string;
  recorded: string;
  logged: string;
  reason: string | null;
  loan_id: number;
  title: string;
  book_code: string;
  member_id: number;
  member: string;
  member_code: string;
};

function money(value: string | number, currency = "") {
  return formatMoney(value, currency);
}

function toCents(value: string | number) {
  return Math.round(Number(value ?? 0) * 100);
}

function FineBadge({ loan }: { loan: FineLoan }) {
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

function FineList({
  loans,
  today,
  returned,
  canManage,
  currency,
}: {
  loans: FineLoan[];
  today: string;
  returned: boolean;
  canManage: boolean;
  currency: string;
}) {
  return (
    <>
      <div className="table-wrap mt-4 hidden md:block">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th scope="col">Book</th>
                <th scope="col">Member</th>
                <th scope="col">Dates</th>
                <th scope="col">Overdue</th>
                <th scope="col">Fine</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.loan_id}>
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
                    <p className="text-xs text-muted">
                      Loan #{loan.loan_id}
                    </p>
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
                    {(loan.email || loan.phone) && (
                      <p className="mt-0.5 max-w-[180px] break-words text-xs text-muted">
                        {[loan.email, loan.phone].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </td>
                  <td>
                    <dl className="grid gap-0.5 text-xs">
                      <div className="flex gap-1">
                        <dt className="text-muted">Borrowed</dt>
                        <dd>{loan.borrowed}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-muted">Due</dt>
                        <dd className="font-medium text-danger">
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
                    <p className="text-sm font-medium text-danger">
                      {loan.days_overdue}{" "}
                      {loan.days_overdue === 1 ? "day" : "days"}
                    </p>
                    <p className="text-muted">
                      {returned ? "late" : "past due"}
                    </p>
                  </td>
                  <td className="text-xs">
                    <dl className="grid gap-0.5 tabular-nums">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">Accrued</dt>
                        <dd>{money(loan.charged, currency)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">Paid</dt>
                        <dd>{money(loan.paid, currency)}</dd>
                      </div>
                      {toCents(loan.waived) > 0 && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted">Waived</dt>
                          <dd>{money(loan.waived, currency)}</dd>
                        </div>
                      )}
                      <div className="mt-0.5 flex justify-between gap-3 border-t pt-0.5 font-medium">
                        <dt>Outstanding</dt>
                        <dd>{money(loan.balance, currency)}</dd>
                      </div>
                    </dl>
                  </td>
                  <td>
                    <FineBadge loan={loan} />
                  </td>
                  <td>
                    {canManage ? (
                      <FineActions
                        loanId={loan.loan_id}
                        balance={loan.balance}
                        today={today}
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
          <li key={loan.loan_id} className="card p-4">
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
              <FineBadge loan={loan} />
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
            {(loan.email || loan.phone) && (
              <p className="mt-0.5 break-words text-xs text-muted">
                {[loan.email, loan.phone].filter(Boolean).join(" · ")}
              </p>
            )}

            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted">Borrowed</dt>
                <dd>{loan.borrowed}</dd>
              </div>
              <div>
                <dt className="text-muted">Due</dt>
                <dd className="font-medium text-danger">
                  {loan.due}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Returned</dt>
                <dd>{loan.returned ?? "Not yet"}</dd>
              </div>
            </dl>

            <p className="mt-2 text-sm font-medium text-danger">
              {loan.days_overdue}{" "}
              {loan.days_overdue === 1 ? "day" : "days"}{" "}
              {returned ? "late" : "past due"}
            </p>

            <dl className="mt-2 grid grid-cols-2 gap-1 text-xs tabular-nums">
              <div>
                <dt className="text-muted">Accrued</dt>
                <dd>{money(loan.charged, currency)}</dd>
              </div>
              <div>
                <dt className="text-muted">Paid</dt>
                <dd>{money(loan.paid, currency)}</dd>
              </div>
              {toCents(loan.waived) > 0 && (
                <div>
                  <dt className="text-muted">Waived</dt>
                  <dd>{money(loan.waived, currency)}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted">Outstanding</dt>
                <dd className="font-medium">{money(loan.balance, currency)}</dd>
              </div>
            </dl>

            <p className="mt-2 text-xs text-muted">Loan #{loan.loan_id}</p>

            {canManage && (
              <div className="mt-3">
                <FineActions
                  loanId={loan.loan_id}
                  balance={loan.balance}
                  today={today}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function LedgerBadge({ kind }: { kind: "payment" | "waiver" }) {
  const classes = kind === "payment" ? "badge-success" : "badge-info";

  return (
    <span className={`badge capitalize ${classes}`}>{kind}</span>
  );
}

function PaymentHistory({
  entries,
  currency,
}: {
  entries: LedgerRow[];
  currency: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={ReceiptText}
          title="No payments recorded"
          description="Fine payments and waivers will appear here with their reason."
        />
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap mt-4 hidden md:block">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[820px]">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Type</th>
                <th scope="col">Member & book</th>
                <th scope="col">Amount</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="text-xs">
                    <p>{entry.recorded}</p>
                    <p className="text-muted">Logged {entry.logged}</p>
                  </td>
                  <td>
                    <LedgerBadge kind={entry.kind} />
                  </td>
                  <td>
                    <Link
                      href={`/members/${entry.member_id}`}
                      className="text-sm font-medium text-foreground hover:text-brand hover:underline"
                    >
                      {entry.member}
                    </Link>
                    <p className="text-xs text-muted">{entry.member_code}</p>
                    <p className="mt-0.5 text-xs">
                      {entry.title}{" "}
                      <span className="text-muted">
                        · {entry.book_code} · Loan #{entry.loan_id}
                      </span>
                    </p>
                  </td>
                  <td className="font-medium tabular-nums">
                    {money(entry.amount, currency)}
                  </td>
                  <td className="text-xs">
                    {entry.reason ? (
                      <span className="break-words">{entry.reason}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 md:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium tabular-nums">
                  {money(entry.amount, currency)}
                </p>
                <p className="text-xs text-muted">{entry.recorded}</p>
              </div>
              <LedgerBadge kind={entry.kind} />
            </div>
            <p className="mt-2 text-sm">
              <Link
                href={`/members/${entry.member_id}`}
                className="font-medium hover:text-brand hover:underline"
              >
                {entry.member}
              </Link>
              <span className="text-xs text-muted">
                {" "}
                · {entry.member_code}
              </span>
            </p>
            <p className="mt-0.5 text-xs">
              {entry.title}{" "}
              <span className="text-muted">
                · {entry.book_code} · Loan #{entry.loan_id}
              </span>
            </p>
            {entry.reason && (
              <p className="mt-2 break-words text-xs text-muted">
                {entry.reason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

async function FinesView({ canManage }: { canManage: boolean }) {
  // materialise any newly overdue days before reading balances
  await sql`select accrue_fines()`;

  const [settingsRows, statsRows, overdue, returnedFines, ledger] =
    await Promise.all([
      sql<FineSettings[]>`
        select
          c.fine_enabled,
          c.fine_per_day,
          c.fine_grace_days,
          l.currency_symbol,
          to_char(current_date, 'YYYY-MM-DD') as today
        from circulation_settings c
        join library_settings l on l.id
        where c.id
      `,
      sql<FineStats[]>`
        with charges as (
          select loan_id, sum(amount) as charged
          from fine_charges
          group by loan_id
        ),
        settled as (
          select
            loan_id,
            coalesce(sum(amount) filter (where kind = 'payment'), 0) as paid,
            coalesce(sum(amount) filter (where kind = 'waiver'), 0) as waived
          from fine_payments
          group by loan_id
        )
        select
          (
            select count(*)::int
            from loans
            where returned_on is null and due_on < current_date
          ) as overdue,
          coalesce(
            (select sum(amount) from fine_payments where kind = 'payment'), 0
          )::numeric(10,2) as collected,
          coalesce(
            (select sum(amount) from fine_payments where kind = 'waiver'), 0
          )::numeric(10,2) as waived,
          coalesce((
            select sum(
              coalesce(c.charged, 0) - coalesce(s.paid, 0) - coalesce(s.waived, 0)
            )
            from loans l
            left join charges c on c.loan_id = l.id
            left join settled s on s.loan_id = l.id
            where coalesce(c.charged, 0) > coalesce(s.paid, 0) + coalesce(s.waived, 0)
          ), 0)::numeric(10,2) as outstanding
      `,
      sql<FineLoan[]>`
        with charges as (
          select loan_id, sum(amount) as charged
          from fine_charges
          group by loan_id
        ),
        settled as (
          select
            loan_id,
            coalesce(sum(amount) filter (where kind = 'payment'), 0) as paid,
            coalesce(sum(amount) filter (where kind = 'waiver'), 0) as waived
          from fine_payments
          group by loan_id
        )
        select
          l.id as loan_id,
          l.member_id,
          m.name as member,
          m.member_code,
          m.email,
          m.phone,
          l.book_id,
          b.book_code,
          b.title,
          a.name as author,
          to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
          to_char(l.due_on, 'DD Mon YYYY') as due,
          to_char(l.returned_on, 'DD Mon YYYY') as returned,
          (current_date - l.due_on)::int as days_overdue,
          coalesce(c.charged, 0)::numeric(10,2) as charged,
          coalesce(s.paid, 0)::numeric(10,2) as paid,
          coalesce(s.waived, 0)::numeric(10,2) as waived,
          (
            coalesce(c.charged, 0) - coalesce(s.paid, 0) - coalesce(s.waived, 0)
          )::numeric(10,2) as balance
        from loans l
        join books b on b.id = l.book_id
        join authors a on a.id = b.author_id
        join members m on m.id = l.member_id
        left join charges c on c.loan_id = l.id
        left join settled s on s.loan_id = l.id
        where l.returned_on is null and l.due_on < current_date
        order by l.due_on asc, l.id
      `,
      sql<FineLoan[]>`
        with charges as (
          select loan_id, sum(amount) as charged
          from fine_charges
          group by loan_id
        ),
        settled as (
          select
            loan_id,
            coalesce(sum(amount) filter (where kind = 'payment'), 0) as paid,
            coalesce(sum(amount) filter (where kind = 'waiver'), 0) as waived
          from fine_payments
          group by loan_id
        )
        select
          l.id as loan_id,
          l.member_id,
          m.name as member,
          m.member_code,
          m.email,
          m.phone,
          l.book_id,
          b.book_code,
          b.title,
          a.name as author,
          to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
          to_char(l.due_on, 'DD Mon YYYY') as due,
          to_char(l.returned_on, 'DD Mon YYYY') as returned,
          greatest(l.returned_on - l.due_on, 0)::int as days_overdue,
          coalesce(c.charged, 0)::numeric(10,2) as charged,
          coalesce(s.paid, 0)::numeric(10,2) as paid,
          coalesce(s.waived, 0)::numeric(10,2) as waived,
          (
            coalesce(c.charged, 0) - coalesce(s.paid, 0) - coalesce(s.waived, 0)
          )::numeric(10,2) as balance
        from loans l
        join books b on b.id = l.book_id
        join authors a on a.id = b.author_id
        join members m on m.id = l.member_id
        left join charges c on c.loan_id = l.id
        left join settled s on s.loan_id = l.id
        where l.returned_on is not null
          and coalesce(c.charged, 0) > 0
        order by l.returned_on desc, l.id desc
        limit 200
      `,
      sql<LedgerRow[]>`
        select
          fp.id,
          fp.kind,
          fp.amount,
          to_char(fp.recorded_on, 'DD Mon YYYY') as recorded,
          to_char(fp.created_at, 'DD Mon YYYY HH24:MI') as logged,
          fp.reason,
          l.id as loan_id,
          b.title,
          b.book_code,
          m.id as member_id,
          m.name as member,
          m.member_code
        from fine_payments fp
        join loans l on l.id = fp.loan_id
        join books b on b.id = l.book_id
        join members m on m.id = l.member_id
        order by fp.recorded_on desc, fp.id desc
        limit 100
      `,
    ]);

  const settings = settingsRows[0];
  const stats = statsRows[0];
  const fineEnabled = Boolean(settings?.fine_enabled);
  const finePerDay = settings?.fine_per_day ?? "0.00";
  const fineGraceDays = settings?.fine_grace_days ?? 0;
  const currencySymbol = settings?.currency_symbol ?? "";
  const today = settings?.today ?? "";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Overdue books"
          value={stats.overdue}
          hint="Open loans past their due date"
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Outstanding"
          value={money(stats.outstanding, currencySymbol)}
          hint="Unpaid and partially paid fines"
          icon={Wallet}
          tone="warning"
        />
        <StatCard
          label="Collected"
          value={money(stats.collected, currencySymbol)}
          hint="Fine payments on record"
          icon={HandCoins}
          tone="success"
        />
        <StatCard
          label="Waived"
          value={money(stats.waived, currencySymbol)}
          hint="Fines waived with a reason"
          icon={Scale}
          tone="neutral"
        />
      </div>

      <div>
        {canManage && (
          <FinePolicyForm
            enabled={fineEnabled}
            finePerDay={finePerDay}
            fineGraceDays={fineGraceDays}
          />
        )}
        {fineEnabled ? (
          <p className="mt-2 text-xs text-muted">
            Charging {money(finePerDay, currencySymbol)} for each overdue day
            {fineGraceDays > 0
              ? `, starting ${fineGraceDays} ${
                  fineGraceDays === 1 ? "day" : "days"
                } after the due date`
              : ""}
            . Accrual runs automatically from the current date.
          </p>
        ) : (
          <p className="mt-2 rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning">
            {canManage
              ? "Fines are turned off. Overdue books are still tracked below; enable fines above to start charging."
              : "Fines are turned off. Overdue books are still tracked below; ask an administrator to enable charging."}
          </p>
        )}
      </div>

      <section aria-labelledby="overdue-heading">
        <SectionHeader
          id="overdue-heading"
          title="Overdue books"
          description={`Open loans past due, with member and book details. ${
            fineGraceDays > 0
              ? `Fines start ${fineGraceDays} ${
                  fineGraceDays === 1 ? "day" : "days"
                } after the due date.`
              : "Overdue days count from the day after the due date."
          }`}
          action={
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">
                {overdue.length}
              </span>{" "}
              shown
            </p>
          }
        />

        {overdue.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Scale}
              title="Nothing is overdue"
              description="Every open loan is still within its due date."
            />
          </div>
        ) : (
          <FineList
            loans={overdue}
            today={today}
            returned={false}
            canManage={canManage}
            currency={currencySymbol}
          />
        )}
      </section>

      <section aria-labelledby="returned-fines-heading">
        <SectionHeader
          id="returned-fines-heading"
          title="Returned books with fines"
          description="Late returns closed from the overdue list. Unpaid balances can still be settled."
          action={
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">
                {returnedFines.length}
              </span>{" "}
              shown
            </p>
          }
        />

        {returnedFines.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={ReceiptText}
              title="No returned fines"
              description="No returned loans have fines on record."
            />
          </div>
        ) : (
          <FineList
            loans={returnedFines}
            today={today}
            returned
            canManage={canManage}
            currency={currencySymbol}
          />
        )}
      </section>

      <section aria-labelledby="history-heading">
        <SectionHeader
          id="history-heading"
          title="Payment history"
          description="Every fine payment and waiver, newest first. Waivers keep the recorded reason."
          action={
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">
                {ledger.length}
              </span>{" "}
              shown
            </p>
          }
        />

        <PaymentHistory entries={ledger} currency={currencySymbol} />
      </section>
    </div>
  );
}

function FinesSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card h-24" />
        ))}
      </div>
      <div className="card h-40" />
      <div className="card h-80" />
      <div className="card h-64" />
    </div>
  );
}

export default async function FinesPage() {
  await connection();
  const user = await requirePagePermission("fines.read");
  const canManage = hasPermission(user, "fines.manage");

  return (
    <div className="space-y-6">
      <PageIntro>
        {canManage
          ? "Track late returns, calculate fines and record payments or waivers."
          : "Review overdue loans, accrued fines and payment history."}
      </PageIntro>

      <Suspense fallback={<FinesSkeleton />}>
        <FinesView canManage={canManage} />
      </Suspense>
    </div>
  );
}
