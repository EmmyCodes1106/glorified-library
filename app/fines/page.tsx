import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import AppNav from "../app-nav";
import LibraryBrand from "../library-brand";
import { formatMoney } from "@/lib/settings";
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

function StatCard({
  label,
  value,
  hint,
  dot,
  valueClass = "",
}: {
  label: string;
  value: string | number;
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
      <p
        className={`mt-2 text-3xl font-semibold tabular-nums ${valueClass}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}

function FineBadge({ loan }: { loan: FineLoan }) {
  const charged = toCents(loan.charged);
  const paid = toCents(loan.paid);
  const waived = toCents(loan.waived);
  const balance = charged - paid - waived;

  let label = "No fine";
  let classes = "border-gray-300 text-gray-500 dark:border-gray-700";

  if (charged > 0) {
    if (balance <= 0) {
      label = waived > 0 && paid === 0 ? "Waived" : "Paid";
      classes =
        label === "Waived"
          ? "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400"
          : "border-green-300 text-green-700 dark:border-green-800 dark:text-green-400";
    } else if (paid + waived > 0) {
      label = "Partial";
      classes =
        "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400";
    } else {
      label = "Unpaid";
      classes =
        "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400";
    }
  }

  return (
    <span
      className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${classes}`}
    >
      {label}
    </span>
  );
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
      <div className="mt-4 hidden overflow-hidden rounded-lg border md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
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
                  Overdue
                </th>
                <th scope="col" className="p-3 font-medium">
                  Fine
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
                <tr key={loan.loan_id} className="align-top">
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
                    <p className="text-xs text-gray-500">
                      Loan #{loan.loan_id}
                    </p>
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
                    {(loan.email || loan.phone) && (
                      <p className="mt-0.5 max-w-[180px] break-words text-xs text-gray-500">
                        {[loan.email, loan.phone].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className="p-3">
                    <dl className="grid gap-0.5 text-xs">
                      <div className="flex gap-1">
                        <dt className="text-gray-500">Borrowed</dt>
                        <dd>{loan.borrowed}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-gray-500">Due</dt>
                        <dd className="font-medium text-red-600 dark:text-red-400">
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
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">
                      {loan.days_overdue}{" "}
                      {loan.days_overdue === 1 ? "day" : "days"}
                    </p>
                    <p className="text-gray-500">
                      {returned ? "late" : "past due"}
                    </p>
                  </td>
                  <td className="p-3 text-xs">
                    <dl className="grid gap-0.5 tabular-nums">
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Accrued</dt>
                        <dd>{money(loan.charged, currency)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Paid</dt>
                        <dd>{money(loan.paid, currency)}</dd>
                      </div>
                      {toCents(loan.waived) > 0 && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-gray-500">Waived</dt>
                          <dd>{money(loan.waived, currency)}</dd>
                        </div>
                      )}
                      <div className="mt-0.5 flex justify-between gap-3 border-t pt-0.5 font-medium">
                        <dt>Outstanding</dt>
                        <dd>{money(loan.balance, currency)}</dd>
                      </div>
                    </dl>
                  </td>
                  <td className="p-3">
                    <FineBadge loan={loan} />
                  </td>
                  <td className="p-3">
                    {canManage ? (
                      <FineActions
                        loanId={loan.loan_id}
                        balance={loan.balance}
                        today={today}
                      />
                    ) : (
                      <span className="text-xs text-gray-500">Read-only</span>
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
          <li key={loan.loan_id} className="rounded-lg border p-4">
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
              <FineBadge loan={loan} />
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
            {(loan.email || loan.phone) && (
              <p className="mt-0.5 break-words text-xs text-gray-500">
                {[loan.email, loan.phone].filter(Boolean).join(" · ")}
              </p>
            )}

            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-gray-500">Borrowed</dt>
                <dd>{loan.borrowed}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Due</dt>
                <dd className="font-medium text-red-600 dark:text-red-400">
                  {loan.due}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Returned</dt>
                <dd>{loan.returned ?? "Not yet"}</dd>
              </div>
            </dl>

            <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">
              {loan.days_overdue}{" "}
              {loan.days_overdue === 1 ? "day" : "days"}{" "}
              {returned ? "late" : "past due"}
            </p>

            <dl className="mt-2 grid grid-cols-2 gap-1 text-xs tabular-nums">
              <div>
                <dt className="text-gray-500">Accrued</dt>
                <dd>{money(loan.charged, currency)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Paid</dt>
                <dd>{money(loan.paid, currency)}</dd>
              </div>
              {toCents(loan.waived) > 0 && (
                <div>
                  <dt className="text-gray-500">Waived</dt>
                  <dd>{money(loan.waived, currency)}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Outstanding</dt>
                <dd className="font-medium">{money(loan.balance, currency)}</dd>
              </div>
            </dl>

            <p className="mt-2 text-xs text-gray-500">Loan #{loan.loan_id}</p>

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
  const classes =
    kind === "payment"
      ? "border-green-300 text-green-700 dark:border-green-800 dark:text-green-400"
      : "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400";

  return (
    <span
      className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${classes}`}
    >
      {kind}
    </span>
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
      <p className="mt-4 rounded-lg border p-6 text-sm text-gray-500">
        No fine payments or waivers recorded yet.
      </p>
    );
  }

  return (
    <>
      <div className="mt-4 hidden overflow-hidden rounded-lg border md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900">
              <tr>
                <th scope="col" className="p-3 font-medium">
                  Date
                </th>
                <th scope="col" className="p-3 font-medium">
                  Type
                </th>
                <th scope="col" className="p-3 font-medium">
                  Member & book
                </th>
                <th scope="col" className="p-3 font-medium">
                  Amount
                </th>
                <th scope="col" className="p-3 font-medium">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="p-3 text-xs">
                    <p>{entry.recorded}</p>
                    <p className="text-gray-500">Logged {entry.logged}</p>
                  </td>
                  <td className="p-3">
                    <LedgerBadge kind={entry.kind} />
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/members/${entry.member_id}`}
                      className="text-sm font-medium underline underline-offset-4"
                    >
                      {entry.member}
                    </Link>
                    <p className="text-xs text-gray-500">{entry.member_code}</p>
                    <p className="mt-0.5 text-xs">
                      {entry.title}{" "}
                      <span className="text-gray-500">
                        · {entry.book_code} · Loan #{entry.loan_id}
                      </span>
                    </p>
                  </td>
                  <td className="p-3 font-medium tabular-nums">
                    {money(entry.amount, currency)}
                  </td>
                  <td className="p-3 text-xs">
                    {entry.reason ? (
                      <span className="break-words">{entry.reason}</span>
                    ) : (
                      <span className="text-gray-500">—</span>
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
          <li key={entry.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium tabular-nums">
                  {money(entry.amount, currency)}
                </p>
                <p className="text-xs text-gray-500">{entry.recorded}</p>
              </div>
              <LedgerBadge kind={entry.kind} />
            </div>
            <p className="mt-2 text-sm">
              <Link
                href={`/members/${entry.member_id}`}
                className="underline underline-offset-4"
              >
                {entry.member}
              </Link>
              <span className="text-xs text-gray-500">
                {" "}
                · {entry.member_code}
              </span>
            </p>
            <p className="mt-0.5 text-xs">
              {entry.title}{" "}
              <span className="text-gray-500">
                · {entry.book_code} · Loan #{entry.loan_id}
              </span>
            </p>
            {entry.reason && (
              <p className="mt-2 break-words text-xs text-gray-500">
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
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Overdue books"
          value={stats.overdue}
          hint="Open loans past their due date"
          dot="bg-red-500"
          valueClass={stats.overdue > 0 ? "text-red-600" : ""}
        />
        <StatCard
          label="Outstanding"
          value={money(stats.outstanding, currencySymbol)}
          hint="Unpaid and partially paid fines"
          dot="bg-amber-500"
          valueClass={toCents(stats.outstanding) > 0 ? "text-amber-600" : ""}
        />
        <StatCard
          label="Collected"
          value={money(stats.collected, currencySymbol)}
          hint="Fine payments on record"
          dot="bg-green-600"
          valueClass={toCents(stats.collected) > 0 ? "text-green-600" : ""}
        />
        <StatCard
          label="Waived"
          value={money(stats.waived, currencySymbol)}
          hint="Fines waived with a reason"
          dot="bg-gray-400"
        />
      </div>

      <div className="mt-6">
        {canManage && (
          <FinePolicyForm
            enabled={fineEnabled}
            finePerDay={finePerDay}
            fineGraceDays={fineGraceDays}
          />
        )}
        {fineEnabled ? (
          <p className="mt-2 text-xs text-gray-500">
            Charging {money(finePerDay, currencySymbol)} for each overdue day
            {fineGraceDays > 0
              ? `, starting ${fineGraceDays} ${
                  fineGraceDays === 1 ? "day" : "days"
                } after the due date`
              : ""}
            . Accrual runs automatically from the current date.
          </p>
        ) : (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-400">
            {canManage
              ? "Fines are turned off. Overdue books are still tracked below; enable fines above to start charging."
              : "Fines are turned off. Overdue books are still tracked below; ask an administrator to enable charging."}
          </p>
        )}
      </div>

      <section className="mt-8" aria-labelledby="overdue-heading">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="overdue-heading" className="text-lg font-semibold">
              Overdue books
            </h2>
            <p className="text-sm text-gray-500">
              Open loans past due, with member and book details.{" "}
              {fineGraceDays > 0
                ? `Fines start ${fineGraceDays} ${
                    fineGraceDays === 1 ? "day" : "days"
                  } after the due date.`
                : "Overdue days count from the day after the due date."}
            </p>
          </div>
          <p className="text-sm text-gray-500">
            <span className="font-medium text-foreground">{overdue.length}</span>{" "}
            shown
          </p>
        </div>

        {overdue.length === 0 ? (
          <p className="mt-4 rounded-lg border p-6 text-sm text-gray-500">
            Nothing is overdue. Every open loan is still within its due date.
          </p>
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

      <section className="mt-8" aria-labelledby="returned-fines-heading">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="returned-fines-heading" className="text-lg font-semibold">
              Returned books with fines
            </h2>
            <p className="text-sm text-gray-500">
              Late returns closed from the overdue list. Unpaid balances can
              still be settled.
            </p>
          </div>
          <p className="text-sm text-gray-500">
            <span className="font-medium text-foreground">
              {returnedFines.length}
            </span>{" "}
            shown
          </p>
        </div>

        {returnedFines.length === 0 ? (
          <p className="mt-4 rounded-lg border p-6 text-sm text-gray-500">
            No returned loans have fines on record.
          </p>
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

      <section className="mt-8" aria-labelledby="history-heading">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="history-heading" className="text-lg font-semibold">
              Payment history
            </h2>
            <p className="text-sm text-gray-500">
              Every fine payment and waiver, newest first. Waivers keep the
              recorded reason.
            </p>
          </div>
          <p className="text-sm text-gray-500">
            <span className="font-medium text-foreground">{ledger.length}</span>{" "}
            shown
          </p>
        </div>

        <PaymentHistory entries={ledger} currency={currencySymbol} />
      </section>
    </>
  );
}

function FinesSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 rounded-lg border" />
        ))}
      </div>
      <div className="mt-6 h-40 rounded-lg border" />
      <div className="mt-8 h-80 rounded-lg border" />
      <div className="mt-8 h-64 rounded-lg border" />
    </div>
  );
}

export default async function FinesPage() {
  await connection();
  const user = await requirePagePermission("fines.read");
  const canManage = hasPermission(user, "fines.manage");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <LibraryBrand />
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            Overdue books & fines
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {canManage
              ? "Track late returns, calculate fines and record payments or waivers."
              : "Review overdue loans, accrued fines and payment history."}
          </p>
        </div>
        <AppNav current="fines" />
      </header>

      <Suspense fallback={<FinesSkeleton />}>
        <FinesView canManage={canManage} />
      </Suspense>
    </main>
  );
}
