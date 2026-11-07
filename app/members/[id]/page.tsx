import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getLendingSettings } from "@/lib/settings";
import AppNav from "../../app-nav";
import type { MemberStatus } from "../../actions";
import LoanActions from "../../loan-actions";
import StatusBadge from "../status-badge";
import MemberActions from "./member-actions";

export const metadata = {
  title: "Member profile",
};

// the profile needs the member id to resolve before it can render
export const instant = false;

type Params = Promise<{ id: string }>;

type MemberProfile = {
  id: number;
  member_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: MemberStatus;
  joined: string;
  expires: string | null;
  loan_limit: number;
};

type LoanRow = {
  id: number;
  book_code: string;
  title: string;
  author: string;
  borrowed: string;
  due: string;
  returned: string | null;
  overdue: boolean;
  duration_days: number;
  renewal_count: number;
};

function StatCard({
  label,
  value,
  hint,
  valueClass = "",
}: {
  label: string;
  value: number;
  hint: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border p-4 sm:p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}

function LoanStatus({ loan }: { loan: LoanRow }) {
  if (loan.returned) {
    return (
      <span className="rounded-full border border-green-300 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:border-green-800 dark:text-green-400">
        Returned
      </span>
    );
  }
  if (loan.overdue) {
    return (
      <span className="rounded-full border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:border-red-800 dark:text-red-400">
        Overdue
      </span>
    );
  }
  return (
    <span className="rounded-full border border-orange-300 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:border-orange-800 dark:text-orange-400">
      On loan
    </span>
  );
}

async function MemberProfileView({
  id,
  canManage,
  canCirculate,
}: {
  id: number;
  canManage: boolean;
  canCirculate: boolean;
}) {
  const [members, currentLoans, history, lending] = await Promise.all([
    sql<MemberProfile[]>`
      select
        id,
        member_code,
        name,
        email,
        phone,
        address,
        case
          when status = 'active'
            and membership_expires_on is not null
            and membership_expires_on < current_date
          then 'expired'
          else status
        end as status,
        to_char(joined_on, 'DD Mon YYYY') as joined,
        to_char(membership_expires_on, 'DD Mon YYYY') as expires,
        loan_limit
      from members
      where id = ${id}
    `,
    sql<LoanRow[]>`
      select
        l.id,
        b.book_code,
        b.title,
        a.name as author,
        to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
        to_char(l.due_on, 'DD Mon YYYY') as due,
        null::text as returned,
        l.due_on < current_date as overdue,
        l.duration_days,
        l.renewal_count
      from loans l
      join books b on b.id = l.book_id
      join authors a on a.id = b.author_id
      where l.member_id = ${id} and l.returned_on is null
      order by l.due_on, l.id
    `,
    sql<LoanRow[]>`
      select
        l.id,
        b.book_code,
        b.title,
        a.name as author,
        to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
        to_char(l.due_on, 'DD Mon YYYY') as due,
        to_char(l.returned_on, 'DD Mon YYYY') as returned,
        (l.returned_on is null and l.due_on < current_date) as overdue,
        l.duration_days,
        l.renewal_count
      from loans l
      join books b on b.id = l.book_id
      join authors a on a.id = b.author_id
      where l.member_id = ${id}
      order by l.borrowed_on desc, l.id desc
    `,
    getLendingSettings(),
  ]);

  const member = members[0];
  if (!member) notFound();

  const overdue = currentLoans.filter((loan) => loan.overdue).length;

  return (
    <div>
      <Link
        href="/members"
        className="text-sm underline underline-offset-4"
      >
        ← All members
      </Link>

      <header className="mb-6 mt-4 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="break-words text-2xl font-bold sm:text-3xl">
              {member.name}
            </h1>
            <StatusBadge status={member.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {member.member_code} · Joined {member.joined}
          </p>
        </div>
        <AppNav current="members" />
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Currently borrowed"
          value={currentLoans.length}
          hint={`Of ${member.loan_limit} books allowed`}
          valueClass={currentLoans.length > 0 ? "text-orange-600" : ""}
        />
        <StatCard
          label="Total loans"
          value={history.length}
          hint="All borrowing on record"
        />
        <StatCard
          label="Overdue"
          value={overdue}
          hint="Open loans past due"
          valueClass={overdue > 0 ? "text-red-600" : ""}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section
            className="rounded-lg border p-4 sm:p-5"
            aria-labelledby="current-loans-heading"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="current-loans-heading" className="font-semibold">
                  Currently borrowed
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Books this member has out now.
                </p>
              </div>
              <span className="shrink-0 rounded-full border px-2.5 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                {currentLoans.length} open
              </span>
            </div>

            {currentLoans.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">
                No books currently borrowed.
              </p>
            ) : (
              <ul className="mt-4 divide-y">
                {currentLoans.map((loan) => (
                  <li
                    key={loan.id}
                    className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/?q=${encodeURIComponent(loan.book_code)}`}
                        className="break-words font-medium underline underline-offset-4"
                      >
                        {loan.title}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {loan.author} · {loan.book_code}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Borrowed {loan.borrowed} · Due{" "}
                        <span
                          className={
                            loan.overdue
                              ? "font-medium text-red-600 dark:text-red-400"
                              : ""
                          }
                        >
                          {loan.due}
                        </span>
                        {loan.overdue ? " · Overdue" : ""}
                        {loan.renewal_count > 0
                          ? ` · Renewed ${loan.renewal_count}×`
                          : ""}
                      </p>
                    </div>
                    {canCirculate && (
                      <LoanActions
                        loanId={loan.id}
                        durationDays={loan.duration_days}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="rounded-lg border p-4 sm:p-5"
            aria-labelledby="history-heading"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="history-heading" className="font-semibold">
                  Borrowing history
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Every loan and return recorded for this member.
                </p>
              </div>
              <span className="shrink-0 rounded-full border px-2.5 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                {history.length} total
              </span>
            </div>

            {history.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">
                No borrowing history yet.
              </p>
            ) : (
              <ul className="mt-4 divide-y">
                {history.map((loan) => (
                  <li key={loan.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/?q=${encodeURIComponent(loan.book_code)}`}
                          className="break-words font-medium underline underline-offset-4"
                        >
                          {loan.title}
                        </Link>
                        <p className="text-xs text-gray-500">
                          {loan.author} · {loan.book_code}
                        </p>
                      </div>
                      <LoanStatus loan={loan} />
                    </div>

                    <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
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
                    {loan.renewal_count > 0 && (
                      <p className="mt-1 text-xs text-gray-500">
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

        <aside className="min-w-0 space-y-6">
          <section
            className="rounded-lg border p-4 sm:p-5"
            aria-labelledby="contact-heading"
          >
            <h2 id="contact-heading" className="font-semibold">
              Contact details
            </h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-gray-500">Email</dt>
                <dd className="break-words">
                  {member.email ? (
                    <a
                      href={`mailto:${member.email}`}
                      className="underline underline-offset-4"
                    >
                      {member.email}
                    </a>
                  ) : (
                    "Not provided"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Phone</dt>
                <dd>
                  {member.phone ? (
                    <a
                      href={`tel:${member.phone.replace(/[^\d+]/g, "")}`}
                      className="underline underline-offset-4"
                    >
                      {member.phone}
                    </a>
                  ) : (
                    "Not provided"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Address</dt>
                <dd className="whitespace-pre-line break-words">
                  {member.address || "Not provided"}
                </dd>
              </div>
            </dl>
          </section>

          <section
            className="rounded-lg border p-4 sm:p-5"
            aria-labelledby="membership-heading"
          >
            <h2 id="membership-heading" className="font-semibold">
              Membership
            </h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Member ID</dt>
                <dd className="font-medium">{member.member_code}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Status</dt>
                <dd className="mt-1">
                  <StatusBadge status={member.status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Registered</dt>
                <dd>{member.joined}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Membership expiry</dt>
                <dd
                  className={
                    member.status === "expired"
                      ? "font-medium text-red-600 dark:text-red-400"
                      : ""
                  }
                >
                  {member.expires ?? "No expiry"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Borrowing limit</dt>
                <dd>
                  {member.loan_limit}{" "}
                  {member.loan_limit === 1 ? "book" : "books"} at a time
                </dd>
              </div>
            </dl>
            {member.status !== "active" && (
              <p className="mt-3 rounded border border-orange-200 bg-orange-50/40 p-2 text-xs text-orange-700 dark:border-orange-900 dark:bg-orange-950/20 dark:text-orange-400">
                {member.status === "expired"
                  ? `This membership ${member.expires ? `expired on ${member.expires}` : "has expired"}. Renew it to resume lending.`
                  : "Only active members can borrow books. Reactivate this membership to resume lending."}
              </p>
            )}
          </section>

          {canManage && (
            <MemberActions
              member={{
                id: member.id,
                name: member.name,
                email: member.email,
                phone: member.phone,
                address: member.address,
                status: member.status,
                loanLimit: member.loan_limit,
              }}
              totalLoans={history.length}
              openLoans={currentLoans.length}
              membershipMonths={lending.membershipMonths}
              maxLoanLimit={lending.maxMemberLimit}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-800" />
      <div className="mt-4 h-9 w-64 max-w-full rounded bg-gray-200 dark:bg-gray-800" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 rounded-lg border" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-72 rounded-lg border lg:col-span-2" />
        <div className="h-72 rounded-lg border" />
      </div>
    </div>
  );
}

export default async function MemberPage({ params }: { params: Params }) {
  await connection();
  const user = await requirePagePermission("members.read");
  const canManage = hasPermission(user, "members.manage");
  const canCirculate = hasPermission(user, "circulation.manage");

  const { id: idText } = await params;
  const id = Number(idText);
  if (!Number.isInteger(id) || id < 1) notFound();

  const [existing] = await sql`select 1 from members where id = ${id}`;
  if (!existing) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <Suspense fallback={<ProfileSkeleton />}>
        <MemberProfileView
          id={id}
          canManage={canManage}
          canCirculate={canCirculate}
        />
      </Suspense>
    </main>
  );
}
