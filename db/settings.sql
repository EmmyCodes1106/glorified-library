-- System settings. Safe to run more than once.

create table if not exists library_settings (
  id boolean primary key default true,
  library_name text not null default 'Glorified Library',
  contact_email text,
  contact_phone text,
  contact_address text,
  website text,
  logo_data_url text,
  default_member_limit int not null default 5,
  max_member_limit int not null default 100,
  membership_months int not null default 0,
  opening_hours jsonb not null default '{}'::jsonb,
  currency_symbol text not null default '',
  notice_text text,
  updated_at timestamptz not null default now(),
  constraint library_settings_singleton check (id),
  constraint library_settings_name_check
    check (length(btrim(library_name)) between 1 and 120),
  constraint library_settings_contact_email_check
    check (contact_email is null or length(contact_email) <= 254),
  constraint library_settings_contact_phone_check
    check (contact_phone is null or length(contact_phone) <= 40),
  constraint library_settings_contact_address_check
    check (contact_address is null or length(contact_address) <= 500),
  constraint library_settings_website_check
    check (website is null or length(website) <= 200),
  constraint library_settings_logo_check
    check (
      logo_data_url is null
      or (logo_data_url like 'data:image/%' and length(logo_data_url) <= 450000)
    ),
  constraint library_settings_default_limit_check
    check (default_member_limit between 0 and 100),
  constraint library_settings_max_limit_check
    check (max_member_limit between 0 and 100),
  constraint library_settings_limit_order_check
    check (default_member_limit <= max_member_limit),
  constraint library_settings_membership_months_check
    check (membership_months between 0 and 120),
  constraint library_settings_currency_check
    check (length(currency_symbol) <= 4),
  constraint library_settings_notice_check
    check (notice_text is null or length(notice_text) <= 240)
);

insert into library_settings (id) values (true)
on conflict (id) do nothing;

-- Grace period before a late return starts accruing fines.
alter table circulation_settings
  add column if not exists fine_grace_days int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'circulation_settings_fine_grace_days_check'
  ) then
    alter table circulation_settings
      add constraint circulation_settings_fine_grace_days_check
      check (fine_grace_days between 0 and 30);
  end if;
end $$;

-- Membership validity. A null expiry means the membership does not lapse.
alter table members
  add column if not exists membership_expires_on date;

create index if not exists members_membership_expiry
  on members (membership_expires_on)
  where membership_expires_on is not null;

-- Charge each overdue day once, at the rate in force when it was accrued.
-- The grace period delays the first charge; enabling fines only charges from
-- the effective date, never retroactively.
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
    greatest(l.due_on + 1 + s.fine_grace_days, s.fine_effective_on),
    least(coalesce(l.returned_on, current_date), current_date),
    interval '1 day'
  ) d
  where s.fine_enabled
    and s.fine_per_day > 0
    and l.due_on + s.fine_grace_days
      < least(coalesce(l.returned_on, current_date), current_date)
  on conflict (loan_id, charge_date) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
