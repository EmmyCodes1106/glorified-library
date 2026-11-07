-- Member management upgrade. Safe to run more than once.

alter table members add column if not exists email text;
alter table members add column if not exists address text;
alter table members add column if not exists status text not null default 'active';
alter table members add column if not exists joined_on date not null default current_date;

alter table members add column if not exists member_code text
  generated always as ('MEM-' || lpad(id::text, 6, '0')) stored;

create unique index if not exists members_member_code_key on members (member_code);
create unique index if not exists members_email_lower_key
  on members (lower(email)) where email is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'members_status_check'
  ) then
    alter table members
      add constraint members_status_check
      check (status in ('active', 'suspended', 'expired'));
  end if;
end $$;

-- Existing members joined no later than their first recorded loan.
update members m
set joined_on = least(
  m.joined_on,
  (select min(l.borrowed_on) from loans l where l.member_id = m.id)
)
where exists (select 1 from loans l where l.member_id = m.id);

create index if not exists loans_open_by_member
  on loans (member_id) where returned_on is null;
