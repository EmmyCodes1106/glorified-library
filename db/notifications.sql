-- Notification preferences and delivery ledger. Safe to run more than once.

create table if not exists notification_settings (
  id boolean primary key default true,
  email_enabled boolean not null default true,
  borrowing_confirmation boolean not null default true,
  return_confirmation boolean not null default true,
  due_reminders boolean not null default true,
  overdue_notices boolean not null default true,
  suspension_notices boolean not null default true,
  admin_overdue_alerts boolean not null default false,
  reminder_days_before int not null default 3
    check (reminder_days_before between 0 and 30),
  admin_email text,
  last_run_at timestamptz,
  last_run_summary text,
  updated_at timestamptz not null default now(),
  check (id),
  check (admin_email is null or length(admin_email) <= 254)
);

insert into notification_settings (id) values (true)
on conflict (id) do nothing;

-- one row per notification event; the unique dedupe key makes reminder
-- runs idempotent, so the same reminder is never sent twice
create table if not exists notifications (
  id serial primary key,
  dedupe_key text not null unique,
  type text not null check (
    type in (
      'borrow_confirmation',
      'return_confirmation',
      'due_reminder',
      'overdue_notice',
      'suspension_notice',
      'admin_overdue_alert'
    )
  ),
  audience text not null check (audience in ('member', 'admin')),
  member_id int references members(id) on delete set null,
  loan_id int references loans(id) on delete set null,
  recipient text,
  subject text not null,
  body text not null,
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'skipped', 'failed')),
  email_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (recipient is null or length(recipient) <= 254)
);

create index if not exists notifications_created
  on notifications (created_at desc, id desc);

create index if not exists notifications_type_created
  on notifications (type, created_at desc);

create index if not exists notifications_status_created
  on notifications (email_status, created_at desc);
