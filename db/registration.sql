-- Public staff self-registration with super administrator approval.
--
-- approved_at is null only for accounts that asked for access through the
-- public form. All pre-existing accounts are administrative creations and are
-- therefore marked as approved.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'approved_at'
  ) then
    alter table users add column approved_at timestamptz;
    update users set approved_at = created_at;
  end if;
end $$;
