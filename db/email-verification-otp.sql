alter table email_verifications
  add column if not exists attempts int not null default 0
  check (attempts between 0 and 5);
