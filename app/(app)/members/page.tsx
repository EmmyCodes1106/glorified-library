import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  BookOpen,
  CalendarClock,
  Search,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getLendingSettings } from "@/lib/settings";
import { EmptyState, PageIntro, StatCard } from "@/components/ui";
import type { MemberStatus } from "@/app/actions";
import AddMemberForm from "./add-member-form";
import StatusBadge from "./status-badge";

export const metadata = {
  title: "Members",
};

// every request needs the session cookie before any data is read
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type MemberRow = {
  id: number;
  member_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: MemberStatus;
  joined: string;
  expires: string | null;
  open_loans: number;
  total_loans: number;
  loan_limit: number;
};

type MemberStats = {
  total: number;
  active: number;
  suspended: number;
  expired: number;
  borrowing: number;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

async function MemberDirectory({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q).trim();
  const statusText = first(params.status);
  const status: MemberStatus | "" =
    statusText === "active" ||
    statusText === "suspended" ||
    statusText === "expired"
      ? statusText
      : "";

  const like = `%${q}%`;

  const [members, statsRows] = await Promise.all([
    sql<MemberRow[]>`
      select
        m.id,
        m.member_code,
        m.name,
        m.email,
        m.phone,
        case
          when m.status = 'active'
            and m.membership_expires_on is not null
            and m.membership_expires_on < current_date
          then 'expired'
          else m.status
        end as status,
        to_char(m.joined_on, 'DD Mon YYYY') as joined,
        to_char(m.membership_expires_on, 'DD Mon YYYY') as expires,
        m.loan_limit,
        coalesce(l.open_loans, 0) as open_loans,
        coalesce(l.total_loans, 0) as total_loans
      from members m
      left join (
        select
          member_id,
          count(*) filter (where returned_on is null)::int as open_loans,
          count(*)::int as total_loans
        from loans
        group by member_id
      ) l on l.member_id = m.id
      where (
        ${q} = ''
        or m.name ilike ${like}
        or coalesce(m.email, '') ilike ${like}
        or coalesce(m.phone, '') ilike ${like}
        or m.member_code ilike ${like}
        or m.id::text = ${q}
      )
      ${
        status
          ? sql`and (case
              when m.status = 'active'
                and m.membership_expires_on is not null
                and m.membership_expires_on < current_date
              then 'expired'
              else m.status
            end) = ${status}`
          : sql``
      }
      order by m.name
    `,
    sql<MemberStats[]>`
      select
        count(*)::int as total,
        count(*) filter (
          where status = 'active'
            and (membership_expires_on is null or membership_expires_on >= current_date)
        )::int as active,
        count(*) filter (where status = 'suspended')::int as suspended,
        count(*) filter (
          where status = 'expired'
            or (status = 'active' and membership_expires_on < current_date)
        )::int as expired,
        (
          select count(distinct member_id)::int
          from loans
          where returned_on is null
        ) as borrowing
      from members
    `,
  ]);

  const stats = statsRows[0];
  const hasFilters = Boolean(q || status);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Total members"
          value={stats.total}
          hint="Registered readers"
          icon={Users}
          tone="neutral"
        />
        <StatCard
          label="Active"
          value={stats.active}
          hint="Eligible to borrow"
          icon={UserCheck}
          tone="success"
        />
        <StatCard
          label="Borrowing now"
          value={stats.borrowing}
          hint="Members with books out"
          icon={BookOpen}
          tone="brand"
        />
        <StatCard
          label="Suspended"
          value={stats.suspended}
          hint="Lending paused"
          icon={UserX}
          tone="warning"
        />
        <StatCard
          label="Expired"
          value={stats.expired}
          hint="Membership lapsed"
          icon={CalendarClock}
          tone="danger"
        />
      </div>

      <form method="get" className="card p-4" role="search">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label className="grid gap-1">
            <span className="label">Search</span>
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Name, email, phone or member ID"
              className="field w-full"
            />
          </label>
          <label className="grid gap-1">
            <span className="label">Status</span>
            <select name="status" defaultValue={status} className="field w-full">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary">
            <Search size={15} strokeWidth={2.25} aria-hidden="true" />
            Apply filters
          </button>
          {hasFilters && (
            <Link
              href="/members"
              className="text-sm font-medium text-muted hover:text-foreground hover:underline"
            >
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          <span className="font-semibold text-foreground">{members.length}</span>{" "}
          {members.length === 1 ? "member" : "members"}
          {hasFilters ? ` of ${stats.total}` : ""}
        </p>
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title={hasFilters ? "No members match these filters" : "No members yet"}
          description={
            hasFilters
              ? "Try a different search or clear the filters to see everyone."
              : "Register the first reader above to start lending."
          }
          action={
            hasFilters ? (
              <Link href="/members" className="btn btn-sm btn-secondary">
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="data-table min-w-[760px]">
                <thead>
                  <tr>
                    <th scope="col">Member</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Joined</th>
                    <th scope="col">Status</th>
                    <th scope="col">Borrowing</th>
                    <th scope="col" className="!text-right">
                      Profile
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <Link
                          href={`/members/${member.id}`}
                          className="font-medium text-foreground hover:text-brand hover:underline"
                        >
                          {member.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">
                          {member.member_code}
                        </p>
                      </td>
                      <td>
                        <p className="break-words">
                          {member.email ?? "No email on file"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {member.phone ?? "No phone"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap">
                        {member.joined}
                        <span className="mt-0.5 block text-xs text-muted">
                          {member.expires
                            ? `Expires ${member.expires}`
                            : "No expiry"}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={member.status} />
                      </td>
                      <td>
                        {member.open_loans > 0 ? (
                          <span className="font-medium text-warning">
                            {member.open_loans} current
                          </span>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                        <span className="mt-0.5 block text-xs text-muted">
                          {member.total_loans} total · limit {member.loan_limit}
                        </span>
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/members/${member.id}`}
                          className="btn btn-sm btn-secondary whitespace-nowrap"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="grid grid-cols-1 gap-3 md:hidden">
            {members.map((member) => (
              <li key={member.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/members/${member.id}`}
                      className="break-words font-medium hover:text-brand hover:underline"
                    >
                      {member.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      {member.member_code}
                    </p>
                  </div>
                  <StatusBadge status={member.status} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs text-muted">Email</dt>
                    <dd className="break-words">
                      {member.email ?? "No email on file"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted">Phone</dt>
                    <dd>{member.phone ?? "No phone"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Joined</dt>
                    <dd>
                      {member.joined}
                      <span className="block text-xs text-muted">
                        {member.expires
                          ? `Expires ${member.expires}`
                          : "No expiry"}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Borrowing</dt>
                    <dd>
                      {member.open_loans > 0 ? (
                        <span className="font-medium text-warning">
                          {member.open_loans} current
                        </span>
                      ) : (
                        "None"
                      )}
                      <span className="block text-xs text-muted">
                        {member.total_loans} total · limit {member.loan_limit}
                      </span>
                    </dd>
                  </div>
                </dl>

                <Link
                  href={`/members/${member.id}`}
                  className="btn btn-sm btn-secondary mt-3"
                >
                  View profile
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function DirectorySkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="card h-24" />
        ))}
      </div>
      <div className="card h-28" />
      <div className="table-wrap h-64" />
    </div>
  );
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const user = await requirePagePermission("members.read");
  const canManage = hasPermission(user, "members.manage");
  const lending = await getLendingSettings();

  return (
    <div className="space-y-6">
      <PageIntro>
        Register readers, manage membership status and review borrowing at a
        glance.
      </PageIntro>

      {canManage && (
        <AddMemberForm
          defaultLimit={lending.defaultMemberLimit}
          maxLimit={lending.maxMemberLimit}
          membershipMonths={lending.membershipMonths}
        />
      )}

      <Suspense fallback={<DirectorySkeleton />}>
        <MemberDirectory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
