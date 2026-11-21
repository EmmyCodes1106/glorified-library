-- Remembers which catalogue books were already checked for a public-domain
-- edition, so later runs move forward instead of re-scanning the same titles.
create table if not exists public_domain_checks (
  book_id int primary key references books(id) on delete cascade,
  status text not null check (
    status in ('attached', 'no-match', 'unavailable', 'invalid', 'failed')
  ),
  gutenberg_id int,
  detail text,
  checked_by bigint references users(id) on delete set null,
  checked_at timestamptz not null default now()
);
