-- Digital copies read in the browser by members with an open loan.
-- The EPUB itself lives outside the web root (storage/ebooks) and is only
-- streamed through authenticated routes, never linked directly.

create table if not exists book_files (
  id bigserial primary key,
  book_id int not null unique references books(id) on delete cascade,
  format text not null default 'epub' check (format in ('epub')),
  file_name text not null,
  original_name text not null,
  byte_size bigint not null check (byte_size > 0),
  uploaded_by bigint references users(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create unique index if not exists book_files_file_name_key
  on book_files (file_name);
