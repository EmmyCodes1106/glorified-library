-- Emailed sign-in and password-reset codes (lib/otp.ts).

create table if not exists auth_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null check (purpose in ('login', 'reset')),
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_codes_email_purpose_created_at_idx
  on auth_codes (email, purpose, created_at desc);
