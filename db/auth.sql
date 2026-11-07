-- Authentication, role-based access control and audit trail.

create table if not exists users (
  id bigserial primary key,
  name text not null,
  email text not null,
  password_hash text not null,
  role text not null default 'librarian'
    check (role in ('super_admin', 'administrator', 'librarian')),
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_lower_idx
  on users (lower(email));

create table if not exists sessions (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expires_idx on sessions (expires_at);

create table if not exists password_resets (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists password_resets_user_idx on password_resets (user_id);
create index if not exists password_resets_expires_idx on password_resets (expires_at);

create table if not exists audit_logs (
  id bigserial primary key,
  actor_user_id bigint references users(id) on delete set null,
  actor_name text,
  actor_email text,
  actor_role text,
  action text not null,
  entity_type text,
  entity_id text,
  summary text not null,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on audit_logs (created_at desc);
create index if not exists audit_logs_actor_idx on audit_logs (actor_user_id);
create index if not exists audit_logs_action_idx on audit_logs (action);
