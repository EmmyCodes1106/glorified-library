import "server-only";

import sql from "@/db";

export type PortalMemberStatus = "active" | "suspended" | "expired";

export type PortalMember = {
  id: number;
  member_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: PortalMemberStatus;
  joined: string;
  expires: string | null;
  loan_limit: number;
  portal_registered: string | null;
  portal_last_login: string | null;
};

export type PortalLoan = {
  id: number;
  book_code: string;
  title: string;
  author: string;
  borrowed: string;
  due: string;
  due_iso: string;
  returned: string | null;
  returned_iso: string | null;
  overdue: boolean;
  duration_days: number;
  renewal_count: number;
};

export async function getPortalMember(
  id: number
): Promise<PortalMember | null> {
  const [member] = await sql<PortalMember[]>`
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
      to_char(portal_registered_at, 'DD Mon YYYY') as portal_registered,
      to_char(portal_last_login_at, 'DD Mon YYYY HH24:MI') as portal_last_login
    from members
    where id = ${id}
  `;
  return member ?? null;
}

export async function getOpenLoans(memberId: number): Promise<PortalLoan[]> {
  return sql<PortalLoan[]>`
    select
      l.id,
      b.book_code,
      b.title,
      a.name as author,
      to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
      to_char(l.due_on, 'DD Mon YYYY') as due,
      to_char(l.due_on, 'YYYY-MM-DD') as due_iso,
      null::text as returned,
      null::text as returned_iso,
      l.due_on < current_date as overdue,
      l.duration_days,
      l.renewal_count
    from loans l
    join books b on b.id = l.book_id
    join authors a on a.id = b.author_id
    where l.member_id = ${memberId} and l.returned_on is null
    order by l.due_on, l.id
  `;
}

export async function getLoanHistory(
  memberId: number,
  limit = 200
): Promise<PortalLoan[]> {
  return sql<PortalLoan[]>`
    select
      l.id,
      b.book_code,
      b.title,
      a.name as author,
      to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
      to_char(l.due_on, 'DD Mon YYYY') as due,
      to_char(l.due_on, 'YYYY-MM-DD') as due_iso,
      to_char(l.returned_on, 'DD Mon YYYY') as returned,
      to_char(l.returned_on, 'YYYY-MM-DD') as returned_iso,
      (l.returned_on is null and l.due_on < current_date) as overdue,
      l.duration_days,
      l.renewal_count
    from loans l
    join books b on b.id = l.book_id
    join authors a on a.id = b.author_id
    where l.member_id = ${memberId}
    order by l.borrowed_on desc, l.id desc
    limit ${limit}
  `;
}

export type MemberFineSettings = {
  fine_enabled: boolean;
  fine_per_day: string;
  fine_grace_days: number;
  currency_symbol: string;
  today: string;
};

export type MemberFineStats = {
  charged: string;
  paid: string;
  waived: string;
  outstanding: string;
};

export type MemberFineLoan = {
  loan_id: number;
  title: string;
  book_code: string;
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

export type MemberFineLedgerRow = {
  id: number;
  kind: "payment" | "waiver";
  amount: string;
  recorded: string;
  logged: string;
  reason: string | null;
  title: string;
  book_code: string;
  loan_id: number;
};

export async function getMemberFineSettings(): Promise<MemberFineSettings | null> {
  const [row] = await sql<MemberFineSettings[]>`
    select
      c.fine_enabled,
      c.fine_per_day::text as fine_per_day,
      c.fine_grace_days,
      l.currency_symbol,
      to_char(current_date, 'YYYY-MM-DD') as today
    from circulation_settings c
    join library_settings l on l.id
    where c.id
  `;
  return row ?? null;
}

export async function getMemberFineStats(
  memberId: number
): Promise<MemberFineStats> {
  const [row] = await sql<MemberFineStats[]>`
    with member_loans as (
      select id from loans where member_id = ${memberId}
    ),
    charges as (
      select loan_id, sum(amount) as charged
      from fine_charges
      where loan_id in (select id from member_loans)
      group by loan_id
    ),
    settled as (
      select
        loan_id,
        coalesce(sum(amount) filter (where kind = 'payment'), 0) as paid,
        coalesce(sum(amount) filter (where kind = 'waiver'), 0) as waived
      from fine_payments
      where loan_id in (select id from member_loans)
      group by loan_id
    )
    select
      coalesce(
        (select sum(amount) from fine_charges
         where loan_id in (select id from member_loans)), 0
      )::numeric(10,2) as charged,
      coalesce(
        (select sum(amount) from fine_payments
         where loan_id in (select id from member_loans)
           and kind = 'payment'), 0
      )::numeric(10,2) as paid,
      coalesce(
        (select sum(amount) from fine_payments
         where loan_id in (select id from member_loans)
           and kind = 'waiver'), 0
      )::numeric(10,2) as waived,
      coalesce((
        select sum(
          coalesce(c.charged, 0) - coalesce(s.paid, 0) - coalesce(s.waived, 0)
        )
        from member_loans ml
        left join charges c on c.loan_id = ml.id
        left join settled s on s.loan_id = ml.id
        where coalesce(c.charged, 0) > coalesce(s.paid, 0) + coalesce(s.waived, 0)
      ), 0)::numeric(10,2) as outstanding
  `;
  return (
    row ?? { charged: "0.00", paid: "0.00", waived: "0.00", outstanding: "0.00" }
  );
}

export async function getMemberFineLoans(
  memberId: number
): Promise<MemberFineLoan[]> {
  return sql<MemberFineLoan[]>`
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
      b.title,
      b.book_code,
      a.name as author,
      to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
      to_char(l.due_on, 'DD Mon YYYY') as due,
      to_char(l.returned_on, 'DD Mon YYYY') as returned,
      greatest(coalesce(l.returned_on, current_date) - l.due_on, 0)::int
        as days_overdue,
      coalesce(c.charged, 0)::numeric(10,2) as charged,
      coalesce(s.paid, 0)::numeric(10,2) as paid,
      coalesce(s.waived, 0)::numeric(10,2) as waived,
      (
        coalesce(c.charged, 0) - coalesce(s.paid, 0) - coalesce(s.waived, 0)
      )::numeric(10,2) as balance
    from loans l
    join books b on b.id = l.book_id
    join authors a on a.id = b.author_id
    left join charges c on c.loan_id = l.id
    left join settled s on s.loan_id = l.id
    where l.member_id = ${memberId}
      and coalesce(c.charged, 0) > 0
    order by l.due_on desc, l.id desc
  `;
}

export async function getMemberFineLedger(
  memberId: number
): Promise<MemberFineLedgerRow[]> {
  return sql<MemberFineLedgerRow[]>`
    select
      fp.id,
      fp.kind,
      fp.amount,
      to_char(fp.recorded_on, 'DD Mon YYYY') as recorded,
      to_char(fp.created_at, 'DD Mon YYYY HH24:MI') as logged,
      fp.reason,
      b.title,
      b.book_code,
      l.id as loan_id
    from fine_payments fp
    join loans l on l.id = fp.loan_id
    join books b on b.id = l.book_id
    where l.member_id = ${memberId}
    order by fp.recorded_on desc, fp.id desc
    limit 100
  `;
}
