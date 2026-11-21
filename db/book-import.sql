-- Bulk import support. Safe to run more than once.

alter table books add column if not exists open_library_key text;

create unique index if not exists books_open_library_key_key
  on books (open_library_key) where open_library_key is not null;
