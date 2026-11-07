import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getLendingSettings } from "@/lib/settings";
import AppNav from "../app-nav";
import LibraryBrand from "../library-brand";
import type { MemberStatus } from "../actions";
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

function StatCard({
  label,
  value,
  hint,
  dot,
  valueClass = "",
}: {
  label: string;
  value: number;
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
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
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
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Total members"
          value={stats.total}
          hint="Registered readers"
          dot="bg-gray-400"
        />
        <StatCard
          label="Active"
          value={stats.active}
          hint="Eligible to borrow"
          dot="bg-green-600"
          valueClass="text-green-600"
        />
        <StatCard
          label="Borrowing now"
          value={stats.borrowing}
          hint="Members with books out"
          dot="bg-orange-500"
          valueClass={stats.borrowing > 0 ? "text-orange-600" : ""}
        />
        <StatCard
          label="Suspended"
          value={stats.suspended}
          hint="Lending paused"
          dot="bg-orange-400"
          valueClass={stats.suspended > 0 ? "text-orange-600" : ""}
        />
        <StatCard
          label="Expired"
          value={stats.expired}
          hint="Membership lapsed"
          dot="bg-gray-400"
        />
      </div>

      <form method="get" className="mb-4 rounded-lg border p-4" role="search">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Search</span>
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Name, email, phone or member ID"
              className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Status</span>
            <select
              name="status"
              defaultValue={status}
              className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <button className="rounded bg-white px-4 py-2 font-medium text-black">
            Apply filters
          </button>
          {hasFilters && (
            <Link href="/members" className="underline">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-gray-500">
          <span className="font-medium text-foreground">{members.length}</span>{" "}
          {members.length === 1 ? "member" : "members"}
          {hasFilters ? ` of ${stats.total}` : ""}
        </p>
      </div>

      {members.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-gray-500">
          {hasFilters
            ? "No members match these filters. Try a different search or clear the filters."
            : "No members registered yet. Register the first reader above."}
        </p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900">
                  <tr>
                    <th scope="col" className="p-3 font-medium">
                      Member
                    </th>
                    <th scope="col" className="p-3 font-medium">
                      Contact
                    </th>
                    <th scope="col" className="p-3 font-medium">
                      Joined
                    </th>
                    <th scope="col" className="p-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="p-3 font-medium">
                      Borrowing
                    </th>
                    <th scope="col" className="p-3 text-right font-medium">
                      Profile
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {members.map((member) => (
                    <tr key={member.id} className="align-top">
                      <td className="p-3">
                        <Link
                          href={`/members/${member.id}`}
                          className="font-medium underline underline-offset-4"
                        >
                          {member.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {member.member_code}
                        </p>
                      </td>
                      <td className="p-3">
                        <p className="break-words">
                          {member.email ?? "No email on file"}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {member.phone ?? "No phone"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap p-3">
                        {member.joined}
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {member.expires
                            ? `Expires ${member.expires}`
                            : "No expiry"}
                        </span>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={member.status} />
                      </td>
                      <td className="p-3">
                        {member.open_loans > 0 ? (
                          <span className="font-medium text-orange-600 dark:text-orange-400">
                            {member.open_loans} current
                          </span>
                        ) : (
                          <span className="text-gray-500">None</span>
                        )}
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {member.total_loans} total{" "}
                          {member.total_loans === 1 ? "loan" : "loans"} · limit{" "}
                          {member.loan_limit}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/members/${member.id}`}
                          className="whitespace-nowrap underline underline-offset-4"
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
              <li key={member.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/members/${member.id}`}
                      className="break-words font-medium underline underline-offset-4"
                    >
                      {member.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {member.member_code}
                    </p>
                  </div>
                  <StatusBadge status={member.status} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs text-gray-500">Email</dt>
                    <dd className="break-words">
                      {member.email ?? "No email on file"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-gray-500">Phone</dt>
                    <dd>{member.phone ?? "No phone"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Joined</dt>
                    <dd>
                      {member.joined}
                      <span className="block text-xs text-gray-500">
                        {member.expires
                          ? `Expires ${member.expires}`
                          : "No expiry"}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Borrowing</dt>
                    <dd>
                      {member.open_loans > 0 ? (
                        <span className="font-medium text-orange-600 dark:text-orange-400">
                          {member.open_loans} current
                        </span>
                      ) : (
                        "None"
                      )}
                      <span className="block text-xs text-gray-500">
                        {member.total_loans} total{" "}
                        {member.total_loans === 1 ? "loan" : "loans"} · limit{" "}
                        {member.loan_limit}
                      </span>
                    </dd>
                  </div>
                </dl>

                <Link
                  href={`/members/${member.id}`}
                  className="mt-3 inline-block text-sm underline underline-offset-4"
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
    <div className="animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-28 rounded-lg border" />
        ))}
      </div>
      <div className="mt-6 h-24 rounded-lg border" />
      <div className="mt-4 h-64 rounded-lg border" />
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
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <LibraryBrand />
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Members</h1>
          <p className="mt-1 text-sm text-gray-500">
            Register readers, manage membership status and review borrowing.
          </p>
        </div>
        <AppNav current="members" />
      </header>

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
    </main>
  );
}
