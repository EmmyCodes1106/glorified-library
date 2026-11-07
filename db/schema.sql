create table authors (
  id serial primary key,
  name text not null unique
);

create table categories (
  id serial primary key,
  name text not null unique
);

create unique index categories_name_lower_key on categories (lower(name));

create table genres (
  id serial primary key,
  name text not null unique
);

create unique index genres_name_lower_key on genres (lower(name));

create table books (
  id serial primary key,
  book_code text generated always as ('GLM-' || lpad(id::text, 6, '0')) stored,
  title text not null,
  year int,
  author_id int not null references authors(id),
  category_id int references categories(id) on delete set null,
  description text,
  cover_path text,
  isbn text,
  total_copies int not null default 1 check (total_copies > 0),
  shelf text,
  rack text
);

create unique index books_book_code_key on books (book_code);
create unique index books_isbn_key on books (isbn) where isbn is not null;

create table book_genres (
  book_id int not null references books(id) on delete cascade,
  genre_id int not null references genres(id) on delete cascade,
  primary key (book_id, genre_id)
);

create table members (
  id serial primary key,
  member_code text generated always as ('MEM-' || lpad(id::text, 6, '0')) stored,
  name text not null,
  email text,
  phone text,
  address text,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'expired')),
  joined_on date not null default current_date,
  loan_limit int not null default 5 check (loan_limit between 0 and 100)
);

create unique index members_member_code_key on members (member_code);
create unique index members_email_lower_key
  on members (lower(email)) where email is not null;

create table loans (
  id serial primary key,
  book_id int not null references books(id) on delete cascade,
  member_id int not null references members(id),
  borrowed_on date not null default current_date,
  due_on date not null,
  returned_on date,
  duration_days int not null default 14
    check (duration_days between 1 and 365),
  renewal_count int not null default 0 check (renewal_count >= 0),
  check (due_on >= borrowed_on),
  check (returned_on is null or returned_on >= borrowed_on)
);

-- copies of the same title may be on loan at the same time
create index loans_open_by_book
  on loans (book_id) where returned_on is null;

create index loans_open_by_member
  on loans (member_id) where returned_on is null;

create index loans_open_due
  on loans (due_on) where returned_on is null;

create index loans_returned_on
  on loans (returned_on) where returned_on is not null;

-- a member may not hold two open loans of the same title at once
create unique index loans_one_open_per_member_book
  on loans (member_id, book_id) where returned_on is null;

create table circulation_settings (
  id boolean primary key default true,
  default_loan_days int not null default 14,
  fine_enabled boolean not null default false,
  fine_per_day numeric(10,2) not null default 0
    check (fine_per_day between 0 and 10000),
  fine_effective_on date not null default current_date,
  updated_at timestamptz not null default now(),
  check (id),
  check (default_loan_days between 1 and 365)
);

insert into circulation_settings (id) values (true)
on conflict (id) do nothing;

-- one row per overdue day charged; the primary key makes accrual idempotent
create table fine_charges (
  loan_id int not null references loans(id) on delete cascade,
  charge_date date not null,
  rate numeric(10,2) not null check (rate > 0),
  amount numeric(10,2) not null check (amount > 0),
  primary key (loan_id, charge_date)
);

create index fine_charges_date on fine_charges (charge_date);

-- payments and waivers share one immutable ledger
create table fine_payments (
  id serial primary key,
  loan_id int not null references loans(id) on delete cascade,
  kind text not null check (kind in ('payment', 'waiver')),
  amount numeric(10,2) not null check (amount > 0),
  recorded_on date not null default current_date,
  reason text,
  created_at timestamptz not null default now(),
  check (reason is null or length(reason) <= 500),
  check (kind <> 'waiver' or (reason is not null and length(btrim(reason)) >= 3))
);

create index fine_payments_loan
  on fine_payments (loan_id, recorded_on desc, id desc);

create or replace function accrue_fines() returns integer
language plpgsql
as $$
declare
  inserted integer;
begin
  insert into fine_charges (loan_id, charge_date, rate, amount)
  select l.id, d::date, s.fine_per_day, s.fine_per_day
  from loans l
  join circulation_settings s on s.id
  cross join lateral generate_series(
    greatest(l.due_on + 1, s.fine_effective_on),
    least(coalesce(l.returned_on, current_date), current_date),
    interval '1 day'
  ) d
  where s.fine_enabled
    and s.fine_per_day > 0
    and l.due_on < least(coalesce(l.returned_on, current_date), current_date)
  on conflict (loan_id, charge_date) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

create table notification_settings (
  id boolean primary key default true,
  email_enabled boolean not null default true,
  borrowing_confirmation boolean not null default true,
  return_confirmation boolean not null default true,
  due_reminders boolean not null default true,
  overdue_notices boolean not null default true,
  suspension_notices boolean not null default true,
  admin_overdue_alerts boolean not null default false,
  reminder_days_before int not null default 3
    check (reminder_days_before between 0 and 30),
  admin_email text,
  last_run_at timestamptz,
  last_run_summary text,
  updated_at timestamptz not null default now(),
  check (id),
  check (admin_email is null or length(admin_email) <= 254)
);

insert into notification_settings (id) values (true);

create table notifications (
  id serial primary key,
  dedupe_key text not null unique,
  type text not null check (
    type in (
      'borrow_confirmation',
      'return_confirmation',
      'due_reminder',
      'overdue_notice',
      'suspension_notice',
      'admin_overdue_alert'
    )
  ),
  audience text not null check (audience in ('member', 'admin')),
  member_id int references members(id) on delete set null,
  loan_id int references loans(id) on delete set null,
  recipient text,
  subject text not null,
  body text not null,
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'skipped', 'failed')),
  email_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (recipient is null or length(recipient) <= 254)
);

create index notifications_created
  on notifications (created_at desc, id desc);

create index notifications_type_created
  on notifications (type, created_at desc);

create index notifications_status_created
  on notifications (email_status, created_at desc);

