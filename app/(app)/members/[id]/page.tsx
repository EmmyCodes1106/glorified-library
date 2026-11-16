import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getLendingSettings } from "@/lib/settings";
import { AlertTriangle, BookOpen, History } from "lucide-react";
import { StatCard } from "@/components/ui";
import type { MemberStatus } from "@/app/actions";
import LoanActions from "@/components/loan-actions";
import StatusBadge from "../status-badge";
import MemberActions from "./member-actions";
import PortalPasswordPanel from "./portal-password-panel";

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
  portal_registered: string | null;
  portal_last_login: string | null;
  email_verified: boolean;
  has_portal_password: boolean;
};

type PendingPasswordRequest = {
  requested: string;
  note: string | null;
};

type LoanRow = {
  id: number;
  book_code: string;
  title: string;
  author: string;
  borrowed: string;
  due: string;
  due_iso: string;
  returned: string | null;
  overdue: boolean;
  duration_days: number;
  renewal_count: number;
};

function LoanStatus({ loan }: { loan: LoanRow }) {
  if (loan.returned) {
    return <span className="badge badge-success">Returned</span>;
  }
  if (loan.overdue) {
    return <span className="badge badge-danger">Overdue</span>;
  }
  return <span className="badge badge-warning">On loan</span>;
}

async function MemberProfileView({
  id,
  canManage,
  canCirculate,
  isSuperAdmin,
}: {
  id: number;
  canManage: boolean;
  canCirculate: boolean;
  isSuperAdmin: boolean;
}) {
  const [members, currentLoans, history, lending, passwordRequests] =
    await Promise.all([
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
        loan_limit,
        (email_verified_at is not null) as email_verified,
        (password_hash is not null) as has_portal_password,
        to_char(portal_registered_at, 'DD Mon YYYY') as portal_registered,
        to_char(portal_last_login_at, 'DD Mon YYYY HH24:MI') as portal_last_login
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
        to_char(l.due_on, 'YYYY-MM-DD') as due_iso,
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
        to_char(l.due_on, 'YYYY-MM-DD') as due_iso,
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
    sql<PendingPasswordRequest[]>`
      select
        to_char(requested_at, 'DD Mon YYYY HH24:MI') as requested,
        note
      from member_password_requests
      where member_id = ${id} and status = 'pending'
      order by requested_at desc
      limit 1
    `,
  ]);

  const member = members[0];
  if (!member) notFound();

  const passwordRequest = passwordRequests[0] ?? null;
  const overdue = currentLoans.filter((loan) => loan.overdue).length;

  return (
    <div className="space-y-6">
      <Link
        href="/members"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-brand"
      >
        ← All members
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="break-words text-2xl font-semibold tracking-tight">
          {member.name}
        </h2>
        <StatusBadge status={member.status} />
        {passwordRequest && (
          <span className="badge badge-warning">Password change requested</span>
        )}
      </div>
      <p className="-mt-3 text-sm text-muted">
        {member.member_code} · Joined {member.joined}
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Currently borrowed"
          value={currentLoans.length}
          hint={`Of ${member.loan_limit} books allowed`}
          icon={BookOpen}
          tone="brand"
        />
        <StatCard
          label="Total loans"
          value={history.length}
          hint="All borrowing on record"
          icon={History}
          tone="neutral"
        />
        <StatCard
          label="Overdue"
          value={overdue}
          hint="Open loans past due"
          icon={AlertTriangle}
          tone={overdue > 0 ? "danger" : "success"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section
            className="card p-5"
            aria-labelledby="current-loans-heading"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="current-loans-heading" className="font-semibold">
                  Currently borrowed
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Books this member has out now.
                </p>
              </div>
              <span className="badge badge-neutral shrink-0">
                {currentLoans.length} open
              </span>
            </div>

            {currentLoans.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
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
                      <p className="text-xs text-muted">
                        {loan.author} · {loan.book_code}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Borrowed {loan.borrowed} · Due{" "}
                        <span
                          className={
                            loan.overdue
                              ? "font-medium text-danger"
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
                        dueDate={loan.due_iso}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="card p-5"
            aria-labelledby="history-heading"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="history-heading" className="font-semibold">
                  Borrowing history
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Every loan and return recorded for this member.
                </p>
              </div>
              <span className="badge badge-neutral shrink-0">
                {history.length} total
              </span>
            </div>

            {history.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
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
                        <p className="text-xs text-muted">
                          {loan.author} · {loan.book_code}
                        </p>
                      </div>
                      <LoanStatus loan={loan} />
                    </div>

                    <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-muted">Borrowed</dt>
                        <dd>{loan.borrowed}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Due</dt>
                        <dd
                          className={
                            loan.overdue
                              ? "font-medium text-danger"
                              : ""
                          }
                        >
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

        <aside className="min-w-0 space-y-6">
          <section
            className="card p-5"
            aria-labelledby="contact-heading"
          >
            <h2 id="contact-heading" className="font-semibold">
              Contact details
            </h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-muted">Email</dt>
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
                <dt className="text-xs text-muted">Phone</dt>
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
                <dt className="text-xs text-muted">Address</dt>
                <dd className="whitespace-pre-line break-words">
                  {member.address || "Not provided"}
                </dd>
              </div>
            </dl>
          </section>

          <section
            className="card p-5"
            aria-labelledby="membership-heading"
          >
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
                  <StatusBadge status={member.status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Registered</dt>
                <dd>{member.joined}</dd>
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
                <dt className="text-xs text-muted">Member portal</dt>
                <dd className="mt-1">
                  {member.portal_registered ? (
                    <span className="badge badge-success">Active</span>
                  ) : (
                    <span className="badge badge-neutral">Not set up</span>
                  )}
                </dd>
                {member.portal_last_login && (
                  <p className="mt-1 text-xs text-muted">
                    Last sign-in {member.portal_last_login}
                  </p>
                )}
              </div>
            </dl>
            {member.status !== "active" && (
              <p className="mt-3 rounded-lg border border-warning/25 bg-warning-soft p-2 text-xs text-warning">
                {member.status === "expired"
                  ? `This membership ${member.expires ? `expired on ${member.expires}` : "has expired"}. Renew it to resume lending.`
                  : "Only active members can borrow books. Reactivate this membership to resume lending."}
              </p>
            )}
          </section>

          {isSuperAdmin && (
            <PortalPasswordPanel
              memberId={member.id}
              memberName={member.name}
              hasPassword={member.has_portal_password}
              emailVerified={member.email_verified}
              request={passwordRequest}
            />
          )}

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
    <div className="space-y-4" aria-hidden="true">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton mt-4 h-9 w-64 max-w-full" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="card h-28" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card h-72 lg:col-span-2" />
        <div className="card h-72" />
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
    <div className="space-y-6">
      <Suspense fallback={<ProfileSkeleton />}>
        <MemberProfileView
          id={id}
          canManage={canManage}
          canCirculate={canCirculate}
          isSuperAdmin={user.role === "super_admin"}
        />
      </Suspense>
    </div>
  );
}
