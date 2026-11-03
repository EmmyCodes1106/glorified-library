create table authors (
  id serial primary key,
  name text not null unique
);

create table books (
  id serial primary key,
  title text not null,
  year int,
  author_id int not null references authors(id)
);

create table members (
  id serial primary key,
  name text not null,
  phone text
);

create table loans (
  id serial primary key,
  book_id int not null references books(id) on delete cascade,
  member_id int not null references members(id),
  borrowed_on date not null default current_date,
  due_on date not null,
  returned_on date
);

-- a book can have only one loan that hasn't been returned
create unique index one_open_loan_per_book
  on loans (book_id) where returned_on is null;