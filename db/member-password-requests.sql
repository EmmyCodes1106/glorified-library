-- Member portal password change requests, resolved by a Super Administrator.
-- Safe to run more than once.

create table if not exists member_password_requests (
  id bigserial primary key,
  member_id int not null references members(id) on delete cascade,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'dismissed')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by bigint references users(id) on delete set null
);

-- One open request per member keeps the queue readable.
create unique index if not exists member_password_requests_one_pending
  on member_password_requests (member_id)
  where status = 'pending';

create index if not exists member_password_requests_queue_idx
  on member_password_requests (requested_at)
  where status = 'pending';
