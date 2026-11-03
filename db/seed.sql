insert into authors (name) values
  ('Chinua Achebe'),
  ('Chimamanda Ngozi Adichie'),
  ('Wole Soyinka'),
  ('Buchi Emecheta'),
  ('Ngũgĩ wa Thiong''o');

insert into books (title, year, author_id) values
  ('Things Fall Apart', 1958, (select id from authors where name = 'Chinua Achebe')),
  ('No Longer at Ease', 1960, (select id from authors where name = 'Chinua Achebe')),
  ('Arrow of God', 1964, (select id from authors where name = 'Chinua Achebe')),
  ('Half of a Yellow Sun', 2006, (select id from authors where name = 'Chimamanda Ngozi Adichie')),
  ('Purple Hibiscus', 2003, (select id from authors where name = 'Chimamanda Ngozi Adichie')),
  ('Americanah', 2013, (select id from authors where name = 'Chimamanda Ngozi Adichie')),
  ('Death and the King''s Horseman', 1975, (select id from authors where name = 'Wole Soyinka')),
  ('The Joys of Motherhood', 1979, (select id from authors where name = 'Buchi Emecheta')),
  ('Second-Class Citizen', 1974, (select id from authors where name = 'Buchi Emecheta')),
  ('A Grain of Wheat', 1967, (select id from authors where name = 'Ngũgĩ wa Thiong''o'));

insert into members (name, phone) values
  ('Ada Obi', '08011111111'),
  ('Tunde Bakare', '08022222222'),
  ('Ngozi Eze', '08033333333'),
  ('Ibrahim Musa', '08044444444'),
  ('Funke Alade', null);

-- two books on loan: Things Fall Apart and Americanah
insert into loans (book_id, member_id, borrowed_on, due_on) values
  ((select id from books where title = 'Things Fall Apart'),
   (select id from members where name = 'Ada Obi'),
   current_date - 3, current_date + 11),
  ((select id from books where title = 'Americanah'),
   (select id from members where name = 'Tunde Bakare'),
   current_date - 7, current_date + 7);