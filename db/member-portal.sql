-- Member self-service portal. Safe to run more than once.

alter table members add column if not exists password_hash text;
alter table members add column if not exists portal_registered_at timestamptz;
alter table members add column if not exists portal_last_login_at timestamptz;
alter table members add column if not exists failed_login_attempts int not null default 0;
alter table members add column if not exists locked_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'members_failed_login_attempts_check'
  ) then
    alter table members
      add constraint members_failed_login_attempts_check
      check (failed_login_attempts >= 0);
  end if;
end $$;

create table if not exists member_sessions (
  id bigserial primary key,
  member_id int not null references members(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists member_sessions_member_idx
  on member_sessions (member_id);

create index if not exists member_sessions_token_idx
  on member_sessions (token_hash);

create table if not exists member_password_resets (
  id bigserial primary key,
  member_id int not null references members(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists member_password_resets_member_idx
  on member_password_resets (member_id);
