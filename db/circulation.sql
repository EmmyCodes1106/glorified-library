-- Library circulation upgrade. Safe to run more than once.

alter table members add column if not exists loan_limit int not null default 5;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'members_loan_limit_check'
  ) then
    alter table members
      add constraint members_loan_limit_check
      check (loan_limit between 0 and 100);
  end if;
end $$;

alter table loans add column if not exists duration_days int not null default 14;
alter table loans add column if not exists renewal_count int not null default 0;

-- keep the stored duration honest for loans created before this upgrade
update loans
set duration_days = greatest(1, due_on - borrowed_on)
where duration_days = 14
  and due_on - borrowed_on <> 14;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'loans_duration_days_check'
  ) then
    alter table loans
      add constraint loans_duration_days_check
      check (duration_days between 1 and 365);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'loans_due_after_borrowed'
  ) then
    alter table loans
      add constraint loans_due_after_borrowed
      check (due_on >= borrowed_on);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'loans_returned_after_borrowed'
  ) then
    alter table loans
      add constraint loans_returned_after_borrowed
      check (returned_on is null or returned_on >= borrowed_on);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'loans_renewal_count_check'
  ) then
    alter table loans
      add constraint loans_renewal_count_check
      check (renewal_count >= 0);
  end if;
end $$;

-- a member may not hold two open loans of the same title at once
create unique index if not exists loans_one_open_per_member_book
  on loans (member_id, book_id) where returned_on is null;

create index if not exists loans_open_due
  on loans (due_on) where returned_on is null;

create index if not exists loans_returned_on
  on loans (returned_on) where returned_on is not null;

create table if not exists circulation_settings (
  id boolean primary key default true,
  default_loan_days int not null default 14,
  updated_at timestamptz not null default now(),
  constraint circulation_settings_singleton check (id),
  constraint circulation_settings_days_check
    check (default_loan_days between 1 and 365)
);

insert into circulation_settings (id) values (true)
on conflict (id) do nothing;
