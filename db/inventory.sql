-- Inventory upgrade. Safe to run more than once.

create table if not exists categories (
  id serial primary key,
  name text not null unique
);

create unique index if not exists categories_name_lower_key
  on categories (lower(name));

create table if not exists genres (
  id serial primary key,
  name text not null unique
);

create unique index if not exists genres_name_lower_key
  on genres (lower(name));

create table if not exists book_genres (
  book_id int not null references books(id) on delete cascade,
  genre_id int not null references genres(id) on delete cascade,
  primary key (book_id, genre_id)
);

alter table books add column if not exists category_id int references categories(id) on delete set null;
alter table books add column if not exists description text;
alter table books add column if not exists cover_path text;
alter table books add column if not exists isbn text;
alter table books add column if not exists total_copies int not null default 1;
alter table books add column if not exists shelf text;
alter table books add column if not exists rack text;

alter table books add column if not exists book_code text
  generated always as ('GLM-' || lpad(id::text, 6, '0')) stored;

create unique index if not exists books_book_code_key on books (book_code);
create unique index if not exists books_isbn_key on books (isbn) where isbn is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'books_total_copies_positive'
  ) then
    alter table books
      add constraint books_total_copies_positive check (total_copies > 0);
  end if;
end $$;

-- Copies of the same title can now be on loan at the same time.
drop index if exists one_open_loan_per_book;

create index if not exists loans_open_by_book
  on loans (book_id) where returned_on is null;
