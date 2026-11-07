-- Fine policy lives alongside the circulation settings
alter table circulation_settings
  add column if not exists fine_enabled boolean not null default false;
alter table circulation_settings
  add column if not exists fine_per_day numeric(10,2) not null default 0;
alter table circulation_settings
  add column if not exists fine_effective_on date not null default current_date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'circulation_settings_fine_per_day_check'
  ) then
    alter table circulation_settings
      add constraint circulation_settings_fine_per_day_check
      check (fine_per_day between 0 and 10000);
  end if;
end $$;

-- one row per overdue day charged; the primary key makes accrual idempotent
create table if not exists fine_charges (
  loan_id int not null references loans(id) on delete cascade,
  charge_date date not null,
  rate numeric(10,2) not null check (rate > 0),
  amount numeric(10,2) not null check (amount > 0),
  primary key (loan_id, charge_date)
);

create index if not exists fine_charges_date
  on fine_charges (charge_date);

-- payments and waivers share one immutable ledger
create table if not exists fine_payments (
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

create index if not exists fine_payments_loan
  on fine_payments (loan_id, recorded_on desc, id desc);

-- charge each overdue day once, at the rate in force when it was accrued;
-- enabling fines only charges from the effective date, never retroactively
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
