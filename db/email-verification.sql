-- Email verification and outbound email delivery log. Safe to run more than once.

alter table users add column if not exists email_verified_at timestamptz;
alter table members add column if not exists email_verified_at timestamptz;

create table if not exists email_verifications (
  id bigserial primary key,
  user_id bigint references users(id) on delete cascade,
  member_id int references members(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  constraint email_verifications_subject_check check (
    (user_id is not null and member_id is null)
    or (user_id is null and member_id is not null)
  )
);

create index if not exists email_verifications_user_idx
  on email_verifications (user_id);

create index if not exists email_verifications_member_idx
  on email_verifications (member_id);

create index if not exists email_verifications_token_idx
  on email_verifications (token_hash);

create table if not exists email_log (
  id bigserial primary key,
  recipient text not null,
  subject text not null,
  purpose text not null,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists email_log_created_idx
  on email_log (created_at desc);

create index if not exists email_log_status_idx
  on email_log (status);

-- Accounts that already existed before verification was introduced stay usable:
-- their addresses were trusted by the library when staff approved them.
update users
set email_verified_at = coalesce(approved_at, created_at, now())
where email_verified_at is null;

update members
set email_verified_at = coalesce(portal_registered_at, now())
where portal_registered_at is not null
  and email_verified_at is null;
