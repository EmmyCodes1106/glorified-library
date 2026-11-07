import sql from "@/db";
import { getLibraryIdentity } from "./settings";

export type ReportId =
  | "inventory"
  | "availability"
  | "members"
  | "loans"
  | "returns"
  | "overdue"
  | "fines"
  | "most-borrowed"
  | "most-active"
  | "activity";

export type ReportDefinition = {
  id: ReportId;
  title: string;
  shortTitle: string;
  description: string;
  usesDates: boolean;
  usesCategory: boolean;
  usesPeriod: boolean;
  dateLabel?: string;
};

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: "inventory",
    title: "Complete book inventory",
    shortTitle: "Inventory",
    description:
      "Every catalogue title with copies owned, copies on loan and shelf location.",
    usesDates: false,
    usesCategory: true,
    usesPeriod: false,
  },
  {
    id: "availability",
    title: "Available and borrowed books",
    shortTitle: "Availability",
    description:
      "Current availability by title, including copies on loan and titles with no free copies.",
    usesDates: false,
    usesCategory: true,
    usesPeriod: false,
  },
  {
    id: "members",
    title: "Registered library members",
    shortTitle: "Members",
    description:
      "Membership register with contact details, borrowing activity and outstanding fines.",
    usesDates: true,
    usesCategory: false,
    usesPeriod: false,
    dateLabel: "Joined",
  },
  {
    id: "loans",
    title: "Borrowing transactions",
    shortTitle: "Borrowing",
    description:
      "Loans recorded in the selected period with book, member and current status.",
    usesDates: true,
    usesCategory: true,
    usesPeriod: false,
    dateLabel: "Borrowed",
  },
  {
    id: "returns",
    title: "Returned books",
    shortTitle: "Returns",
    description:
      "Completed loans, punctuality and fines attached to returned books.",
    usesDates: true,
    usesCategory: true,
    usesPeriod: false,
    dateLabel: "Returned",
  },
  {
    id: "overdue",
    title: "Overdue books",
    shortTitle: "Overdue",
    description:
      "Open loans past their due date, with days overdue and any fine balance.",
    usesDates: true,
    usesCategory: true,
    usesPeriod: false,
    dateLabel: "Due",
  },
  {
    id: "fines",
    title: "Outstanding fines and payments",
    shortTitle: "Fines",
    description:
      "Current unpaid balances plus fine payments and waivers recorded in the period.",
    usesDates: true,
    usesCategory: true,
    usesPeriod: false,
    dateLabel: "Payments",
  },
  {
    id: "most-borrowed",
    title: "Most borrowed books",
    shortTitle: "Top books",
    description:
      "Lending totals by title for the selected period, ranked by loans.",
    usesDates: true,
    usesCategory: true,
    usesPeriod: false,
    dateLabel: "Borrowed",
  },
  {
    id: "most-active",
    title: "Most active library members",
    shortTitle: "Top members",
    description:
      "Members ranked by borrowing activity in the selected period.",
    usesDates: true,
    usesCategory: true,
    usesPeriod: false,
    dateLabel: "Borrowed",
  },
  {
    id: "activity",
    title: "Monthly and yearly library activities",
    shortTitle: "Activity",
    description:
      "Borrowing, returns, membership growth and fine activity grouped by month or year.",
    usesDates: true,
    usesCategory: true,
    usesPeriod: true,
    dateLabel: "Activity",
  },
];

export const REPORT_IDS = REPORT_DEFINITIONS.map((report) => report.id);

export function isReportId(value: string): value is ReportId {
  return (REPORT_IDS as string[]).includes(value);
}

export function reportDefinition(id: ReportId): ReportDefinition {
  return REPORT_DEFINITIONS.find((report) => report.id === id)!;
}

export type ReportFilters = {
  start: string;
  end: string;
  category: number | null;
  categoryName: string | null;
  q: string;
  period: "monthly" | "yearly";
};

export type ReportFilterInput = {
  start?: string;
  end?: string;
  category?: string | number | null;
  q?: string;
  period?: string;
};

export type ReportColumnFormat = "text" | "number" | "money";

export type ReportColumn = {
  key: string;
  label: string;
  format?: ReportColumnFormat;
  width?: number;
};

export type ReportRow = Record<string, string | number | null>;

export type ReportSection = {
  key: string;
  title: string;
  description?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  emptyMessage: string;
};

export type ReportStatFormat = "text" | "number" | "money";

export type ReportStat = {
  label: string;
  value: string | number;
  hint?: string;
  format?: ReportStatFormat;
};

export type ReportBranding = {
  name: string;
  logoDataUrl: string | null;
};

export type ReportData = {
  id: ReportId;
  title: string;
  description: string;
  generatedAt: string;
  generatedLabel: string;
  filters: ReportFilters;
  filterSummary: string[];
  stats: ReportStat[];
  sections: ReportSection[];
  filenameBase: string;
  currencySymbol: string;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function defaultStart() {
  return `${new Date().getFullYear()}-01-01`;
}

function validIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function formatIsoDate(value: string) {
  if (!validIsoDate(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}

export function formatGenerated(value: Date) {
  const day = String(value.getDate()).padStart(2, "0");
  const month = MONTHS[value.getMonth()];
  const year = value.getFullYear();
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

export function normaliseFilters(input: ReportFilterInput): ReportFilters {
  const startInput = String(input.start ?? "").trim();
  const endInput = String(input.end ?? "").trim();

  let start = validIsoDate(startInput) ? startInput : defaultStart();
  let end = validIsoDate(endInput) ? endInput : todayIso();
  if (start > end) [start, end] = [end, start];

  const categoryValue = Number(input.category);
  const category =
    Number.isInteger(categoryValue) && categoryValue > 0
      ? categoryValue
      : null;

  return {
    start,
    end,
    category,
    categoryName: null,
    q: String(input.q ?? "").trim().slice(0, 100),
    period: input.period === "yearly" ? "yearly" : "monthly",
  };
}

export async function loadCategories() {
  return sql<{ id: number; name: string }[]>`
    select id, name from categories order by name
  `;
}

function numeric(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatReportValue(
  value: string | number | null,
  format: ReportColumnFormat = "text",
  currency = ""
) {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "money") return `${currency}${numeric(value).toFixed(2)}`;
  if (format === "number") return numeric(value).toLocaleString("en-US");
  return String(value);
}

export function formatReportStat(stat: ReportStat, currency = "") {
  if (stat.format === "money") {
    return `${currency}${numeric(stat.value).toFixed(2)}`;
  }
  if (stat.format === "number") {
    return typeof stat.value === "number"
      ? stat.value.toLocaleString("en-US")
      : stat.value;
  }
  return String(stat.value);
}

function likeFor(q: string) {
  return `%${q}%`;
}

function categoryClause(filters: ReportFilters) {
  return filters.category
    ? sql`and b.category_id = ${filters.category}`
    : sql``;
}

function filterSummary(
  definition: ReportDefinition,
  filters: ReportFilters
): string[] {
  const parts: string[] = [];
  if (definition.usesDates) {
    parts.push(
      `${definition.dateLabel ?? "Date"} ${formatIsoDate(filters.start)} – ${formatIsoDate(filters.end)}`
    );
  }
  if (definition.usesCategory && filters.categoryName) {
    parts.push(`Category: ${filters.categoryName}`);
  }
  if (filters.q) parts.push(`Search: "${filters.q}"`);
  if (definition.usesPeriod) {
    parts.push(
      filters.period === "yearly" ? "Grouped by year" : "Grouped by month"
    );
  }
  return parts.length > 0 ? parts : ["All records"];
}

type InventoryRow = {
  code: string;
  title: string;
  author: string;
  category: string;
  year: string;
  isbn: string;
  copies: number;
  borrowed: number;
  available: number;
  shelf: string;
  rack: string;
};

async function loadInventory(filters: ReportFilters) {
  const like = likeFor(filters.q);
  return sql<InventoryRow[]>`
    select
      b.book_code as code,
      b.title,
      a.name as author,
      coalesce(c.name, 'Uncategorised') as category,
      coalesce(b.year::text, '') as year,
      coalesce(b.isbn, '') as isbn,
      b.total_copies::int as copies,
      coalesce(o.borrowed, 0)::int as borrowed,
      greatest(b.total_copies - coalesce(o.borrowed, 0), 0)::int as available,
      coalesce(b.shelf, '') as shelf,
      coalesce(b.rack, '') as rack
    from books b
    join authors a on a.id = b.author_id
    left join categories c on c.id = b.category_id
    left join (
      select book_id, count(*)::int as borrowed
      from loans
      where returned_on is null
      group by book_id
    ) o on o.book_id = b.id
    where (
      ${filters.q} = ''
      or b.title ilike ${like}
      or a.name ilike ${like}
      or b.book_code ilike ${like}
      or coalesce(b.isbn, '') ilike ${like}
      or coalesce(c.name, '') ilike ${like}
    )
    ${categoryClause(filters)}
    order by b.title
  `;
}

type MemberRow = {
  code: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  joined: string;
  loans: number;
  open_loans: number;
  overdue: number;
  outstanding: number;
};

async function loadMembers(filters: ReportFilters) {
  const like = likeFor(filters.q);
  return sql<MemberRow[]>`
    with charges as (
      select l.member_id, sum(fc.amount) as charged
      from fine_charges fc
      join loans l on l.id = fc.loan_id
      group by l.member_id
    ),
    settled as (
      select
        l.member_id,
        coalesce(sum(fp.amount) filter (where fp.kind = 'payment'), 0) as paid,
        coalesce(sum(fp.amount) filter (where fp.kind = 'waiver'), 0) as waived
      from fine_payments fp
      join loans l on l.id = fp.loan_id
      group by l.member_id
    )
    select
      m.member_code as code,
      m.name,
      coalesce(m.email, '') as email,
      coalesce(m.phone, '') as phone,
      m.status,
      to_char(m.joined_on, 'DD Mon YYYY') as joined,
      count(l.id)::int as loans,
      count(l.id) filter (where l.returned_on is null)::int as open_loans,
      count(l.id) filter (
        where l.returned_on is null and l.due_on < current_date
      )::int as overdue,
      greatest(
        coalesce(ch.charged, 0) - coalesce(s.paid, 0) - coalesce(s.waived, 0),
        0
      )::float8 as outstanding
    from members m
    left join loans l on l.member_id = m.id
    left join charges ch on ch.member_id = m.id
    left join settled s on s.member_id = m.id
    where m.joined_on between ${filters.start}::date and ${filters.end}::date
      and (
        ${filters.q} = ''
        or m.name ilike ${like}
        or m.member_code ilike ${like}
        or coalesce(m.email, '') ilike ${like}
        or coalesce(m.phone, '') ilike ${like}
      )
    group by
      m.id,
      m.member_code,
      m.name,
      m.email,
      m.phone,
      m.status,
      m.joined_on,
      ch.charged,
      s.paid,
      s.waived
    order by m.joined_on desc, m.name
  `;
}

type LoanRow = {
  loan_id: number;
  book_code: string;
  title: string;
  author: string;
  category: string;
  member_code: string;
  member: string;
  borrowed: string;
  due: string;
  returned: string | null;
  duration_days: number;
  renewal_count: number;
  status: string;
};

async function loadLoans(filters: ReportFilters) {
  const like = likeFor(filters.q);
  return sql<LoanRow[]>`
    select
      l.id as loan_id,
      b.book_code,
      b.title,
      a.name as author,
      coalesce(c.name, 'Uncategorised') as category,
      m.member_code,
      m.name as member,
      to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
      to_char(l.due_on, 'DD Mon YYYY') as due,
      to_char(l.returned_on, 'DD Mon YYYY') as returned,
      l.duration_days,
      l.renewal_count,
      case
        when l.returned_on is not null then 'Returned'
        when l.due_on < current_date then 'Overdue'
        else 'Open'
      end as status
    from loans l
    join books b on b.id = l.book_id
    join authors a on a.id = b.author_id
    join members m on m.id = l.member_id
    left join categories c on c.id = b.category_id
    where l.borrowed_on between ${filters.start}::date and ${filters.end}::date
      and (
        ${filters.q} = ''
        or m.name ilike ${like}
        or m.member_code ilike ${like}
        or b.title ilike ${like}
        or b.book_code ilike ${like}
        or coalesce(b.isbn, '') ilike ${like}
        or l.id::text = ${filters.q}
      )
    ${categoryClause(filters)}
    order by l.borrowed_on desc, l.id desc
  `;
}

type ReturnRow = {
  loan_id: number;
  book_code: string;
  title: string;
  author: string;
  category: string;
  member_code: string;
  member: string;
  borrowed: string;
  due: string;
  returned: string;
  days_late: number;
  charged: number;
  balance: number;
};

async function loadReturns(filters: ReportFilters) {
  const like = likeFor(filters.q);
  return sql<ReturnRow[]>`
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
      b.book_code,
      b.title,
      a.name as author,
      coalesce(c.name, 'Uncategorised') as category,
      m.member_code,
      m.name as member,
      to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
      to_char(l.due_on, 'DD Mon YYYY') as due,
      to_char(l.returned_on, 'DD Mon YYYY') as returned,
      greatest(l.returned_on - l.due_on, 0)::int as days_late,
      coalesce(ch.charged, 0)::float8 as charged,
      (
        coalesce(ch.charged, 0) - coalesce(s.paid, 0) - coalesce(s.waived, 0)
      )::float8 as balance
    from loans l
    join books b on b.id = l.book_id
    join authors a on a.id = b.author_id
    join members m on m.id = l.member_id
    left join categories c on c.id = b.category_id
    left join charges ch on ch.loan_id = l.id
    left join settled s on s.loan_id = l.id
    where l.returned_on between ${filters.start}::date and ${filters.end}::date
      and (
        ${filters.q} = ''
        or m.name ilike ${like}
        or m.member_code ilike ${like}
        or b.title ilike ${like}
        or b.book_code ilike ${like}
        or coalesce(b.isbn, '') ilike ${like}
        or l.id::text = ${filters.q}
      )
    ${categoryClause(filters)}
    order by l.returned_on desc, l.id desc
  `;
}

type OverdueRow = {
  loan_id: number;
  book_code: string;
  title: string;
  author: string;
  category: string;
  member_code: string;
  member: string;
  contact: string;
  due: string;
  days_overdue: number;
  charged: number;
  balance: number;
};

async function loadOverdue(filters: ReportFilters) {
  const like = likeFor(filters.q);
  return sql<OverdueRow[]>`
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
      b.book_code,
      b.title,
      a.name as author,
      coalesce(c.name, 'Uncategorised') as category,
      m.member_code,
      m.name as member,
      concat_ws(' · ', nullif(m.email, ''), nullif(m.phone, '')) as contact,
      to_char(l.due_on, 'DD Mon YYYY') as due,
      (current_date - l.due_on)::int as days_overdue,
      coalesce(ch.charged, 0)::float8 as charged,
      (
        coalesce(ch.charged, 0) - coalesce(s.paid, 0) - coalesce(s.waived, 0)
      )::float8 as balance
    from loans l
    join books b on b.id = l.book_id
    join authors a on a.id = b.author_id
    join members m on m.id = l.member_id
    left join categories c on c.id = b.category_id
    left join charges ch on ch.loan_id = l.id
    left join settled s on s.loan_id = l.id
    where l.returned_on is null
      and l.due_on < current_date
      and l.due_on between ${filters.start}::date and ${filters.end}::date
      and (
        ${filters.q} = ''
        or m.name ilike ${like}
        or m.member_code ilike ${like}
        or b.title ilike ${like}
        or b.book_code ilike ${like}
        or coalesce(b.isbn, '') ilike ${like}
        or l.id::text = ${filters.q}
      )
    ${categoryClause(filters)}
    order by l.due_on asc, l.id
  `;
}

type FineBalanceRow = {
  loan_id: number;
  member_code: string;
  member: string;
  title: string;
  book_code: string;
  charged: number;
  paid: number;
  waived: number;
  balance: number;
  status: string;
};

async function loadFineBalances(filters: ReportFilters) {
  const like = likeFor(filters.q);
  return sql<FineBalanceRow[]>`
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
      m.member_code,
      m.name as member,
      b.title,
      b.book_code,
      coalesce(ch.charged, 0)::float8 as charged,
      coalesce(s.paid, 0)::float8 as paid,
      coalesce(s.waived, 0)::float8 as waived,
      (
        coalesce(ch.charged, 0) - coalesce(s.paid, 0) - coalesce(s.waived, 0)
      )::float8 as balance,
      case
        when l.returned_on is not null then 'Returned'
        when l.due_on < current_date then 'Overdue'
        else 'Open'
      end as status
    from loans l
    join books b on b.id = l.book_id
    join members m on m.id = l.member_id
    left join categories c on c.id = b.category_id
    left join charges ch on ch.loan_id = l.id
    left join settled s on s.loan_id = l.id
    where coalesce(ch.charged, 0) > coalesce(s.paid, 0) + coalesce(s.waived, 0)
      and (
        ${filters.q} = ''
        or m.name ilike ${like}
        or m.member_code ilike ${like}
        or b.title ilike ${like}
        or b.book_code ilike ${like}
        or l.id::text = ${filters.q}
      )
    ${categoryClause(filters)}
    order by balance desc, l.id
  `;
}

type FinePaymentRow = {
  id: number;
  recorded: string;
  kind: string;
  amount: number;
  member_code: string;
  member: string;
  title: string;
  book_code: string;
  loan_id: number;
  reason: string;
};

async function loadFinePayments(filters: ReportFilters) {
  const like = likeFor(filters.q);
  return sql<FinePaymentRow[]>`
    select
      fp.id,
      to_char(fp.recorded_on, 'DD Mon YYYY') as recorded,
      fp.kind,
      fp.amount::float8 as amount,
      m.member_code,
      m.name as member,
      b.title,
      b.book_code,
      l.id as loan_id,
      coalesce(fp.reason, '') as reason
    from fine_payments fp
    join loans l on l.id = fp.loan_id
    join books b on b.id = l.book_id
    join members m on m.id = l.member_id
    left join categories c on c.id = b.category_id
    where fp.recorded_on between ${filters.start}::date and ${filters.end}::date
      and (
        ${filters.q} = ''
        or m.name ilike ${like}
        or m.member_code ilike ${like}
        or b.title ilike ${like}
        or b.book_code ilike ${like}
        or l.id::text = ${filters.q}
        or coalesce(fp.reason, '') ilike ${like}
      )
    ${categoryClause(filters)}
    order by fp.recorded_on desc, fp.id desc
  `;
}

type BorrowedBookRow = {
  code: string;
  title: string;
  author: string;
  category: string;
  loans: number;
  borrowers: number;
  last_borrowed: string;
  available: number;
};

async function loadMostBorrowed(filters: ReportFilters) {
  const like = likeFor(filters.q);
  return sql<BorrowedBookRow[]>`
    select
      b.book_code as code,
      b.title,
      a.name as author,
      coalesce(c.name, 'Uncategorised') as category,
      count(l.id)::int as loans,
      count(distinct l.member_id)::int as borrowers,
      to_char(max(l.borrowed_on), 'DD Mon YYYY') as last_borrowed,
      greatest(b.total_copies - coalesce(o.borrowed, 0), 0)::int as available
    from loans l
    join books b on b.id = l.book_id
    join authors a on a.id = b.author_id
    left join categories c on c.id = b.category_id
    left join (
      select book_id, count(*)::int as borrowed
      from loans
      where returned_on is null
      group by book_id
    ) o on o.book_id = b.id
    where l.borrowed_on between ${filters.start}::date and ${filters.end}::date
      and (
        ${filters.q} = ''
        or b.title ilike ${like}
        or a.name ilike ${like}
        or b.book_code ilike ${like}
        or coalesce(b.isbn, '') ilike ${like}
      )
    ${categoryClause(filters)}
    group by b.id, b.book_code, b.title, a.name, c.name, b.total_copies, o.borrowed
    order by loans desc, b.title
  `;
}

type ActiveMemberRow = {
  code: string;
  name: string;
  status: string;
  loans: number;
  returned: number;
  open_loans: number;
  overdue: number;
  last_borrowed: string;
};

async function loadMostActive(filters: ReportFilters) {
  const like = likeFor(filters.q);
  return sql<ActiveMemberRow[]>`
    select
      m.member_code as code,
      m.name,
      m.status,
      count(l.id)::int as loans,
      count(l.id) filter (where l.returned_on is not null)::int as returned,
      count(l.id) filter (where l.returned_on is null)::int as open_loans,
      count(l.id) filter (
        where l.returned_on is null and l.due_on < current_date
      )::int as overdue,
      to_char(max(l.borrowed_on), 'DD Mon YYYY') as last_borrowed
    from loans l
    join members m on m.id = l.member_id
    join books b on b.id = l.book_id
    left join categories c on c.id = b.category_id
    where l.borrowed_on between ${filters.start}::date and ${filters.end}::date
      and (
        ${filters.q} = ''
        or m.name ilike ${like}
        or m.member_code ilike ${like}
        or coalesce(m.email, '') ilike ${like}
        or b.title ilike ${like}
        or b.book_code ilike ${like}
      )
    ${categoryClause(filters)}
    group by m.id, m.member_code, m.name, m.status
    order by loans desc, m.name
  `;
}

type ActivityRow = {
  period: string;
  loans: number;
  returns: number;
  new_members: number;
  fines_charged: number;
  payments: number;
  waivers: number;
};

async function loadActivity(filters: ReportFilters) {
  const gran = filters.period === "yearly" ? "year" : "month";
  const label = filters.period === "yearly" ? "YYYY" : "Mon YYYY";
  const step = filters.period === "yearly" ? "1 year" : "1 month";
  const like = likeFor(filters.q);
  const category = categoryClause(filters);

  return sql<ActivityRow[]>`
    with bounds as (
      select ${filters.start}::date as s, ${filters.end}::date as e
    ),
    periods as (
      select generate_series(
        date_trunc(${gran}, (select s from bounds)),
        date_trunc(${gran}, (select e from bounds)),
        ${step}::interval
      ) as p
    )
    select
      to_char(p, ${label}) as period,
      (
        select count(*)::int
        from loans l
        join books b on b.id = l.book_id
        where date_trunc(${gran}, l.borrowed_on) = p
        ${category}
      ) as loans,
      (
        select count(*)::int
        from loans l
        join books b on b.id = l.book_id
        where l.returned_on is not null
          and date_trunc(${gran}, l.returned_on) = p
        ${category}
      ) as returns,
      (
        select count(*)::int
        from members m
        where date_trunc(${gran}, m.joined_on) = p
      ) as new_members,
      (
        select coalesce(sum(fc.amount), 0)::float8
        from fine_charges fc
        join loans l on l.id = fc.loan_id
        join books b on b.id = l.book_id
        where date_trunc(${gran}, fc.charge_date) = p
        ${category}
      ) as fines_charged,
      (
        select coalesce(sum(fp.amount) filter (where fp.kind = 'payment'), 0)::float8
        from fine_payments fp
        join loans l on l.id = fp.loan_id
        join books b on b.id = l.book_id
        where date_trunc(${gran}, fp.recorded_on) = p
        ${category}
      ) as payments,
      (
        select coalesce(sum(fp.amount) filter (where fp.kind = 'waiver'), 0)::float8
        from fine_payments fp
        join loans l on l.id = fp.loan_id
        join books b on b.id = l.book_id
        where date_trunc(${gran}, fp.recorded_on) = p
        ${category}
      ) as waivers
    from periods
    where (${filters.q} = '' or to_char(p, ${label}) ilike ${like})
    order by p
  `;
}

export async function buildReport(
  id: ReportId,
  input: ReportFilterInput = {}
): Promise<ReportData> {
  const definition = reportDefinition(id);
  const filters = normaliseFilters(input);

  if (definition.usesCategory && filters.category) {
    const [category] = await sql<{ id: number; name: string }[]>`
      select id, name from categories where id = ${filters.category}
    `;
    if (category) filters.categoryName = category.name;
    else filters.category = null;
  }

  if (id === "overdue" || id === "fines") {
    await sql`select accrue_fines()`;
  }

  let stats: ReportStat[] = [];
  let sections: ReportSection[] = [];

  if (id === "inventory") {
    const rows = await loadInventory(filters);
    const copies = rows.reduce((sum, row) => sum + row.copies, 0);
    const borrowed = rows.reduce((sum, row) => sum + row.borrowed, 0);
    const available = rows.reduce((sum, row) => sum + row.available, 0);

    stats = [
      { label: "Titles", value: rows.length, hint: "Catalogue records", format: "number" },
      { label: "Copies owned", value: copies, hint: "Physical stock", format: "number" },
      { label: "On loan", value: borrowed, hint: "Currently borrowed", format: "number" },
      { label: "Available", value: available, hint: "Ready to lend", format: "number" },
    ];
    sections = [
      {
        key: "inventory",
        title: "Inventory",
        columns: [
          { key: "code", label: "Book ID", width: 1.1 },
          { key: "title", label: "Title", width: 2.4 },
          { key: "author", label: "Author", width: 1.6 },
          { key: "category", label: "Category", width: 1.2 },
          { key: "year", label: "Year", width: 0.6 },
          { key: "isbn", label: "ISBN", width: 1.3 },
          { key: "copies", label: "Copies", width: 0.7, format: "number" },
          { key: "borrowed", label: "On loan", width: 0.7, format: "number" },
          { key: "available", label: "Available", width: 0.8, format: "number" },
          { key: "shelf", label: "Shelf", width: 0.7 },
          { key: "rack", label: "Rack", width: 0.7 },
        ],
        rows,
        emptyMessage: "No catalogue titles match the selected filters.",
      },
    ];
  } else if (id === "availability") {
    const inventory = await loadInventory(filters);
    const rows: ReportRow[] = inventory.map((row) => ({
      ...row,
      status:
        row.available === 0
          ? "All copies on loan"
          : row.borrowed > 0
            ? "Partially available"
            : "Available",
    }));
    const totalCopies = inventory.reduce((sum, row) => sum + row.copies, 0);
    const onLoan = inventory.reduce((sum, row) => sum + row.borrowed, 0);
    const unavailable = inventory.filter((row) => row.available === 0).length;

    stats = [
      { label: "Titles", value: rows.length, hint: "Matching titles", format: "number" },
      { label: "Copies owned", value: totalCopies, hint: "Physical stock", format: "number" },
      { label: "On loan", value: onLoan, hint: "Borrowed copies", format: "number" },
      { label: "Unavailable titles", value: unavailable, hint: "No free copies", format: "number" },
    ];
    sections = [
      {
        key: "availability",
        title: "Availability by title",
        columns: [
          { key: "code", label: "Book ID", width: 1.1 },
          { key: "title", label: "Title", width: 2.6 },
          { key: "author", label: "Author", width: 1.7 },
          { key: "category", label: "Category", width: 1.3 },
          { key: "copies", label: "Copies", width: 0.7, format: "number" },
          { key: "borrowed", label: "Borrowed", width: 0.8, format: "number" },
          { key: "available", label: "Available", width: 0.8, format: "number" },
          { key: "status", label: "Status", width: 1.4 },
        ],
        rows,
        emptyMessage: "No books match the selected filters.",
      },
    ];
  } else if (id === "members") {
    const rows = await loadMembers(filters);
    const active = rows.filter((row) => row.status === "active").length;
    const suspended = rows.filter((row) => row.status === "suspended").length;
    const withLoans = rows.filter((row) => row.open_loans > 0).length;

    stats = [
      { label: "Members", value: rows.length, hint: "Registered in range", format: "number" },
      { label: "Active", value: active, hint: "Membership active", format: "number" },
      { label: "Suspended", value: suspended, hint: "Membership suspended", format: "number" },
      { label: "Borrowing now", value: withLoans, hint: "With open loans", format: "number" },
    ];
    sections = [
      {
        key: "members",
        title: "Membership register",
        columns: [
          { key: "code", label: "Member ID", width: 1.1 },
          { key: "name", label: "Name", width: 1.8 },
          { key: "email", label: "Email", width: 1.9 },
          { key: "phone", label: "Phone", width: 1.2 },
          { key: "status", label: "Status", width: 0.9 },
          { key: "joined", label: "Joined", width: 1.1 },
          { key: "loans", label: "Loans", width: 0.6, format: "number" },
          { key: "open_loans", label: "Open", width: 0.6, format: "number" },
          { key: "overdue", label: "Overdue", width: 0.7, format: "number" },
          { key: "outstanding", label: "Outstanding", width: 1.0, format: "money" },
        ],
        rows,
        emptyMessage: "No members joined in the selected date range.",
      },
    ];
  } else if (id === "loans") {
    const rows = await loadLoans(filters);
    const open = rows.filter((row) => row.status !== "Returned").length;
    const returned = rows.filter((row) => row.status === "Returned").length;
    const overdue = rows.filter((row) => row.status === "Overdue").length;
    const average =
      rows.length > 0
        ? rows.reduce((sum, row) => sum + row.duration_days, 0) / rows.length
        : 0;

    stats = [
      { label: "Loans", value: rows.length, hint: "Transactions in range", format: "number" },
      { label: "Open", value: open, hint: "Still on loan", format: "number" },
      { label: "Returned", value: returned, hint: "Completed loans", format: "number" },
      { label: "Overdue", value: overdue, hint: "Past due and open", format: "number" },
      { label: "Avg. term", value: `${average.toFixed(1)} days`, hint: "Borrowing duration" },
    ];
    sections = [
      {
        key: "loans",
        title: "Borrowing transactions",
        columns: [
          { key: "loan_id", label: "Loan #", width: 0.7, format: "number" },
          { key: "title", label: "Book", width: 2.1 },
          { key: "book_code", label: "Book ID", width: 1.0 },
          { key: "author", label: "Author", width: 1.4 },
          { key: "category", label: "Category", width: 1.1 },
          { key: "member", label: "Member", width: 1.5 },
          { key: "member_code", label: "Member ID", width: 1.0 },
          { key: "borrowed", label: "Borrowed", width: 1.0 },
          { key: "due", label: "Due", width: 1.0 },
          { key: "returned", label: "Returned", width: 1.0 },
          { key: "duration_days", label: "Days", width: 0.5, format: "number" },
          { key: "renewal_count", label: "Renewals", width: 0.7, format: "number" },
          { key: "status", label: "Status", width: 0.8 },
        ],
        rows,
        emptyMessage: "No loans were recorded in the selected date range.",
      },
    ];
  } else if (id === "returns") {
    const rows = await loadReturns(filters);
    const late = rows.filter((row) => row.days_late > 0).length;
    const onTime = rows.length - late;
    const lateDays = rows.reduce((sum, row) => sum + row.days_late, 0);
    const charged = rows.reduce((sum, row) => sum + numeric(row.charged), 0);

    stats = [
      { label: "Returns", value: rows.length, hint: "Completed in range", format: "number" },
      { label: "On time", value: onTime, hint: "Returned by due date", format: "number" },
      { label: "Late", value: late, hint: "Returned after due date", format: "number" },
      { label: "Late days", value: lateDays, hint: "Combined delay", format: "number" },
      { label: "Fines charged", value: charged, hint: "On returned books", format: "money" },
    ];
    sections = [
      {
        key: "returns",
        title: "Returned books",
        columns: [
          { key: "loan_id", label: "Loan #", width: 0.7, format: "number" },
          { key: "title", label: "Book", width: 2.1 },
          { key: "book_code", label: "Book ID", width: 1.0 },
          { key: "author", label: "Author", width: 1.4 },
          { key: "category", label: "Category", width: 1.1 },
          { key: "member", label: "Member", width: 1.5 },
          { key: "member_code", label: "Member ID", width: 1.0 },
          { key: "borrowed", label: "Borrowed", width: 1.0 },
          { key: "due", label: "Due", width: 1.0 },
          { key: "returned", label: "Returned", width: 1.0 },
          { key: "days_late", label: "Late days", width: 0.7, format: "number" },
          { key: "charged", label: "Fine", width: 0.8, format: "money" },
          { key: "balance", label: "Balance", width: 0.8, format: "money" },
        ],
        rows,
        emptyMessage: "No books were returned in the selected date range.",
      },
    ];
  } else if (id === "overdue") {
    const rows = await loadOverdue(filters);
    const members = new Set(rows.map((row) => row.member_code)).size;
    const days = rows.reduce((sum, row) => sum + row.days_overdue, 0);
    const balance = rows.reduce((sum, row) => sum + numeric(row.balance), 0);

    stats = [
      { label: "Overdue loans", value: rows.length, hint: "Open past due", format: "number" },
      { label: "Members", value: members, hint: "Affected members", format: "number" },
      { label: "Overdue days", value: days, hint: "Combined delay", format: "number" },
      { label: "Outstanding", value: balance, hint: "Unpaid fine balance", format: "money" },
    ];
    sections = [
      {
        key: "overdue",
        title: "Overdue books",
        columns: [
          { key: "loan_id", label: "Loan #", width: 0.7, format: "number" },
          { key: "title", label: "Book", width: 2.1 },
          { key: "book_code", label: "Book ID", width: 1.0 },
          { key: "author", label: "Author", width: 1.4 },
          { key: "category", label: "Category", width: 1.1 },
          { key: "member", label: "Member", width: 1.5 },
          { key: "member_code", label: "Member ID", width: 1.0 },
          { key: "contact", label: "Contact", width: 1.7 },
          { key: "due", label: "Due", width: 1.0 },
          { key: "days_overdue", label: "Days late", width: 0.7, format: "number" },
          { key: "charged", label: "Fine", width: 0.8, format: "money" },
          { key: "balance", label: "Balance", width: 0.8, format: "money" },
        ],
        rows,
        emptyMessage: "No overdue books fall within the selected due-date range.",
      },
    ];
  } else if (id === "fines") {
    const [balances, payments] = await Promise.all([
      loadFineBalances(filters),
      loadFinePayments(filters),
    ]);
    const outstanding = balances.reduce((sum, row) => sum + numeric(row.balance), 0);
    const collected = payments
      .filter((row) => row.kind === "payment")
      .reduce((sum, row) => sum + numeric(row.amount), 0);
    const waived = payments
      .filter((row) => row.kind === "waiver")
      .reduce((sum, row) => sum + numeric(row.amount), 0);

    stats = [
      { label: "Outstanding", value: outstanding, hint: "Current unpaid balance", format: "money" },
      { label: "Collected", value: collected, hint: "Payments in range", format: "money" },
      { label: "Waived", value: waived, hint: "Waivers in range", format: "money" },
      { label: "Loans with balance", value: balances.length, hint: "Fines still owed", format: "number" },
    ];
    sections = [
      {
        key: "balances",
        title: "Outstanding balances",
        description: "Current unpaid balances across all recorded charges.",
        columns: [
          { key: "loan_id", label: "Loan #", width: 0.7, format: "number" },
          { key: "member", label: "Member", width: 1.6 },
          { key: "member_code", label: "Member ID", width: 1.0 },
          { key: "title", label: "Book", width: 2.0 },
          { key: "book_code", label: "Book ID", width: 1.0 },
          { key: "status", label: "Loan status", width: 0.9 },
          { key: "charged", label: "Charged", width: 0.9, format: "money" },
          { key: "paid", label: "Paid", width: 0.8, format: "money" },
          { key: "waived", label: "Waived", width: 0.8, format: "money" },
          { key: "balance", label: "Balance", width: 0.9, format: "money" },
        ],
        rows: balances,
        emptyMessage: "No outstanding fine balances.",
      },
      {
        key: "payments",
        title: "Payments and waivers",
        description: "Ledger entries recorded in the selected date range.",
        columns: [
          { key: "recorded", label: "Date", width: 1.0 },
          { key: "kind", label: "Type", width: 0.8 },
          { key: "amount", label: "Amount", width: 0.8, format: "money" },
          { key: "member", label: "Member", width: 1.6 },
          { key: "member_code", label: "Member ID", width: 1.0 },
          { key: "title", label: "Book", width: 1.9 },
          { key: "book_code", label: "Book ID", width: 1.0 },
          { key: "loan_id", label: "Loan #", width: 0.6, format: "number" },
          { key: "reason", label: "Reason", width: 1.8 },
        ],
        rows: payments,
        emptyMessage: "No fine payments or waivers were recorded in this range.",
      },
    ];
  } else if (id === "most-borrowed") {
    const rows = await loadMostBorrowed(filters);
    const loans = rows.reduce((sum, row) => sum + row.loans, 0);
    const top = rows[0];

    stats = [
      { label: "Titles borrowed", value: rows.length, hint: "With loans in range", format: "number" },
      { label: "Loans", value: loans, hint: "Total transactions", format: "number" },
      { label: "Top title", value: top ? top.title : "—", hint: top ? `${top.loans} loans` : "No loans" },
      {
        label: "Average",
        value: rows.length > 0 ? (loans / rows.length).toFixed(1) : "0.0",
        hint: "Loans per title",
      },
    ];
    sections = [
      {
        key: "most-borrowed",
        title: "Most borrowed books",
        columns: [
          { key: "rank", label: "Rank", width: 0.5, format: "number" },
          { key: "title", label: "Book", width: 2.5 },
          { key: "code", label: "Book ID", width: 1.1 },
          { key: "author", label: "Author", width: 1.7 },
          { key: "category", label: "Category", width: 1.3 },
          { key: "loans", label: "Loans", width: 0.7, format: "number" },
          { key: "borrowers", label: "Borrowers", width: 0.8, format: "number" },
          { key: "available", label: "Available", width: 0.8, format: "number" },
          { key: "last_borrowed", label: "Last borrowed", width: 1.1 },
        ],
        rows: rows.map((row, index) => ({ ...row, rank: index + 1 })),
        emptyMessage: "No borrowing activity matches the selected filters.",
      },
    ];
  } else if (id === "most-active") {
    const rows = await loadMostActive(filters);
    const loans = rows.reduce((sum, row) => sum + row.loans, 0);
    const top = rows[0];

    stats = [
      { label: "Active members", value: rows.length, hint: "With loans in range", format: "number" },
      { label: "Loans", value: loans, hint: "Total transactions", format: "number" },
      { label: "Top member", value: top ? top.name : "—", hint: top ? `${top.loans} loans` : "No loans" },
      {
        label: "Average",
        value: rows.length > 0 ? (loans / rows.length).toFixed(1) : "0.0",
        hint: "Loans per member",
      },
    ];
    sections = [
      {
        key: "most-active",
        title: "Most active members",
        columns: [
          { key: "rank", label: "Rank", width: 0.5, format: "number" },
          { key: "name", label: "Member", width: 2.0 },
          { key: "code", label: "Member ID", width: 1.1 },
          { key: "status", label: "Status", width: 0.9 },
          { key: "loans", label: "Loans", width: 0.7, format: "number" },
          { key: "returned", label: "Returned", width: 0.8, format: "number" },
          { key: "open_loans", label: "Open", width: 0.7, format: "number" },
          { key: "overdue", label: "Overdue", width: 0.8, format: "number" },
          { key: "last_borrowed", label: "Last borrowed", width: 1.1 },
        ],
        rows: rows.map((row, index) => ({ ...row, rank: index + 1 })),
        emptyMessage: "No member borrowing activity matches the selected filters.",
      },
    ];
  } else {
    const rows = await loadActivity(filters);
    const loans = rows.reduce((sum, row) => sum + row.loans, 0);
    const returns = rows.reduce((sum, row) => sum + row.returns, 0);
    const newMembers = rows.reduce((sum, row) => sum + row.new_members, 0);
    const collected = rows.reduce((sum, row) => sum + numeric(row.payments), 0);
    const charged = rows.reduce((sum, row) => sum + numeric(row.fines_charged), 0);

    stats = [
      { label: "Loans", value: loans, hint: "Borrowed in range", format: "number" },
      { label: "Returns", value: returns, hint: "Completed in range", format: "number" },
      { label: "New members", value: newMembers, hint: "Registered in range", format: "number" },
      { label: "Fines charged", value: charged, hint: "Accrued in range", format: "money" },
      { label: "Payments", value: collected, hint: "Collected in range", format: "money" },
    ];
    sections = [
      {
        key: "activity",
        title:
          filters.period === "yearly"
            ? "Yearly library activity"
            : "Monthly library activity",
        columns: [
          { key: "period", label: filters.period === "yearly" ? "Year" : "Month", width: 1.2 },
          { key: "loans", label: "Loans", width: 0.9, format: "number" },
          { key: "returns", label: "Returns", width: 0.9, format: "number" },
          { key: "new_members", label: "New members", width: 1.0, format: "number" },
          { key: "fines_charged", label: "Fines charged", width: 1.1, format: "money" },
          { key: "payments", label: "Payments", width: 1.0, format: "money" },
          { key: "waivers", label: "Waivers", width: 0.9, format: "money" },
        ],
        rows,
        emptyMessage: "No activity falls within the selected range.",
      },
    ];
  }

  const generated = new Date();
  const identity = await getLibraryIdentity();

  return {
    id,
    title: definition.title,
    description: definition.description,
    generatedAt: generated.toISOString(),
    generatedLabel: formatGenerated(generated),
    filters,
    filterSummary: filterSummary(definition, filters),
    stats,
    sections,
    filenameBase: `${id}-report-${todayIso()}`,
    currencySymbol: identity.currencySymbol,
  };
}
