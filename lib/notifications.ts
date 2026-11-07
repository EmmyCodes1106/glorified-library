import { revalidatePath } from "next/cache";
import sql from "@/db";
import { sendEmail } from "./email";
import { getLibraryIdentity } from "./settings";

export const NOTIFICATION_TYPES = [
  "borrow_confirmation",
  "return_confirmation",
  "due_reminder",
  "overdue_notice",
  "suspension_notice",
  "admin_overdue_alert",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  borrow_confirmation: "Borrowing confirmation",
  return_confirmation: "Return confirmation",
  due_reminder: "Due-date reminder",
  overdue_notice: "Overdue notice",
  suspension_notice: "Suspension notice",
  admin_overdue_alert: "Admin overdue alert",
};

export type NotificationSettings = {
  id: boolean;
  email_enabled: boolean;
  borrowing_confirmation: boolean;
  return_confirmation: boolean;
  due_reminders: boolean;
  overdue_notices: boolean;
  suspension_notices: boolean;
  admin_overdue_alerts: boolean;
  reminder_days_before: number;
  admin_email: string | null;
  last_run_at: string | null;
  last_run_summary: string | null;
};

const FALLBACK_SETTINGS: NotificationSettings = {
  id: true,
  email_enabled: true,
  borrowing_confirmation: true,
  return_confirmation: true,
  due_reminders: true,
  overdue_notices: true,
  suspension_notices: true,
  admin_overdue_alerts: false,
  reminder_days_before: 3,
  admin_email: null,
  last_run_at: null,
  last_run_summary: null,
};

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  const [row] = await sql<NotificationSettings[]>`
    select
      id,
      email_enabled,
      borrowing_confirmation,
      return_confirmation,
      due_reminders,
      overdue_notices,
      suspension_notices,
      admin_overdue_alerts,
      reminder_days_before,
      admin_email,
      to_char(last_run_at, 'DD Mon YYYY HH24:MI') as last_run_at,
      last_run_summary
    from notification_settings
    where id
  `;
  return row ?? FALLBACK_SETTINGS;
}

type EmailStatus = "pending" | "sent" | "skipped" | "failed";

type NewNotification = {
  dedupeKey: string;
  type: NotificationType;
  audience: "member" | "admin";
  memberId: number | null;
  loanId: number | null;
  recipient: string | null;
  subject: string;
  body: string;
  emailEnabled: boolean;
};

type CreateResult = {
  created: boolean;
  emailStatus: EmailStatus | null;
};

// The unique dedupe key is the single source of truth for "sent already".
// A conflicting insert sends nothing, so concurrent runs cannot double-send.
export async function createNotification({
  dedupeKey,
  type,
  audience,
  memberId,
  loanId,
  recipient,
  subject,
  body,
  emailEnabled,
}: NewNotification): Promise<CreateResult> {
  const [row] = await sql<{ id: number }[]>`
    insert into notifications (
      dedupe_key, type, audience, member_id, loan_id, recipient, subject, body
    )
    values (
      ${dedupeKey}, ${type}, ${audience}, ${memberId}, ${loanId},
      ${recipient}, ${subject}, ${body}
    )
    on conflict (dedupe_key) do nothing
    returning id
  `;

  if (!row) return { created: false, emailStatus: null };

  let emailStatus: EmailStatus = "skipped";
  let emailError: string | null = null;

  if (!recipient) {
    emailError = "No email recipient is available for this notification.";
  } else if (!emailEnabled) {
    emailError = "Email delivery is turned off in notification settings.";
  } else {
    const result = await sendEmail({ to: recipient, subject, text: body });
    if (result.status === "sent") {
      emailStatus = "sent";
    } else {
      emailStatus = result.status;
      emailError = result.reason;
    }
  }

  await sql`
    update notifications
    set
      email_status = ${emailStatus},
      email_error = ${emailError},
      sent_at = case when ${emailStatus} = 'sent' then now() else null end
    where id = ${row.id}
  `;

  revalidatePath("/notifications");
  return { created: true, emailStatus };
}

type LoanNotificationRow = {
  loan_id: number;
  member_id: number;
  member_name: string;
  member_code: string;
  member_email: string | null;
  book_title: string;
  book_code: string;
  borrowed: string;
  due: string;
  due_iso: string;
  returned: string | null;
  days_until: number;
  days_overdue: number;
};

async function loadLoanNotification(loanId: number) {
  const [loan] = await sql<LoanNotificationRow[]>`
    select
      l.id as loan_id,
      l.member_id,
      m.name as member_name,
      m.member_code,
      m.email as member_email,
      b.title as book_title,
      b.book_code,
      to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
      to_char(l.due_on, 'DD Mon YYYY') as due,
      to_char(l.due_on, 'YYYY-MM-DD') as due_iso,
      to_char(l.returned_on, 'DD Mon YYYY') as returned,
      (l.due_on - current_date)::int as days_until,
      (coalesce(l.returned_on, current_date) - l.due_on)::int as days_overdue
    from loans l
    join members m on m.id = l.member_id
    join books b on b.id = l.book_id
    where l.id = ${loanId}
  `;
  return loan ?? null;
}

function loanHeader(loan: LoanNotificationRow) {
  return `Member: ${loan.member_name} (${loan.member_code})\nBorrowed: ${loan.borrowed}\nDue: ${loan.due}`;
}

export async function notifyBorrowingConfirmation(loanId: number) {
  const [settings, identity] = await Promise.all([
    loadNotificationSettings(),
    getLibraryIdentity(),
  ]);
  if (!settings.borrowing_confirmation) return;

  const loan = await loadLoanNotification(loanId);
  if (!loan || loan.returned) return;

  await createNotification({
    dedupeKey: `borrow_confirmation:${loan.loan_id}`,
    type: "borrow_confirmation",
    audience: "member",
    memberId: loan.member_id,
    loanId: loan.loan_id,
    recipient: loan.member_email,
    subject: `Borrowing confirmation · ${loan.book_title}`,
    body: [
      `Hello ${loan.member_name},`,
      "",
      `This confirms that you borrowed "${loan.book_title}" (${loan.book_code}) from ${identity.name}.`,
      "",
      loanHeader(loan),
      "",
      "Please return or renew it by the due date.",
      "",
      `${identity.name} Manager`,
    ].join("\n"),
    emailEnabled: settings.email_enabled,
  });
}

export async function notifyReturnConfirmation(loanId: number) {
  const [settings, identity] = await Promise.all([
    loadNotificationSettings(),
    getLibraryIdentity(),
  ]);
  if (!settings.return_confirmation) return;

  const loan = await loadLoanNotification(loanId);
  if (!loan || !loan.returned) return;

  const late =
    loan.days_overdue > 0
      ? `Returned ${loan.days_overdue} ${
          loan.days_overdue === 1 ? "day" : "days"
        } after the due date.`
      : "Returned on time.";

  await createNotification({
    dedupeKey: `return_confirmation:${loan.loan_id}`,
    type: "return_confirmation",
    audience: "member",
    memberId: loan.member_id,
    loanId: loan.loan_id,
    recipient: loan.member_email,
    subject: `Return confirmation · ${loan.book_title}`,
    body: [
      `Hello ${loan.member_name},`,
      "",
      `We have recorded the return of "${loan.book_title}" (${loan.book_code}).`,
      "",
      loanHeader(loan),
      `Returned: ${loan.returned}`,
      "",
      late,
      "",
      "Thank you.",
      `${identity.name} Manager`,
    ].join("\n"),
    emailEnabled: settings.email_enabled,
  });
}

export async function notifySuspension(memberId: number) {
  const [settings, identity] = await Promise.all([
    loadNotificationSettings(),
    getLibraryIdentity(),
  ]);
  if (!settings.suspension_notices) return;

  const [member] = await sql<
    { id: number; name: string; member_code: string; email: string | null }[]
  >`
    select id, name, member_code, email
    from members
    where id = ${memberId}
  `;
  if (!member) return;

  const [clock] = await sql<{ today: string }[]>`
    select to_char(current_date, 'YYYY-MM-DD') as today
  `;

  await createNotification({
    dedupeKey: `suspension_notice:${member.id}:${clock.today}`,
    type: "suspension_notice",
    audience: "member",
    memberId: member.id,
    loanId: null,
    recipient: member.email,
    subject: `Membership suspended · ${member.member_code}`,
    body: [
      `Hello ${member.name},`,
      "",
      `Your ${identity.name} membership (${member.member_code}) has been suspended, so borrowing is paused.`,
      "",
      "Contact the library if you believe this is a mistake or to arrange reactivation.",
      "",
      `${identity.name} Manager`,
    ].join("\n"),
    emailEnabled: settings.email_enabled,
  });
}

export type NotificationRunSummary = {
  created: number;
  alreadyRecorded: number;
  dueReminders: number;
  overdueNotices: number;
  adminAlerts: number;
  emailsSent: number;
  emailsSkipped: number;
  emailsFailed: number;
};

export function describeRun(summary: NotificationRunSummary) {
  const created = summary.created;
  if (created === 0) {
    return "No new notifications were due; earlier reminders were already recorded.";
  }

  const channels = [
    `${summary.emailsSent} sent`,
    `${summary.emailsSkipped} skipped`,
    `${summary.emailsFailed} failed`,
  ].join(", ");

  return `${created} notification${created === 1 ? "" : "s"} recorded (${channels}).`;
}

export async function runNotificationCycle(): Promise<NotificationRunSummary> {
  const [settings, identity] = await Promise.all([
    loadNotificationSettings(),
    getLibraryIdentity(),
  ]);
  const [clock] = await sql<{ today: string; label: string }[]>`
    select
      to_char(current_date, 'YYYY-MM-DD') as today,
      to_char(current_date, 'DD Mon YYYY') as label
  `;

  const summary: NotificationRunSummary = {
    created: 0,
    alreadyRecorded: 0,
    dueReminders: 0,
    overdueNotices: 0,
    adminAlerts: 0,
    emailsSent: 0,
    emailsSkipped: 0,
    emailsFailed: 0,
  };

  async function record(input: NewNotification) {
    const result = await createNotification(input);
    if (!result.created) {
      summary.alreadyRecorded += 1;
      return false;
    }
    summary.created += 1;
    if (result.emailStatus === "sent") summary.emailsSent += 1;
    else if (result.emailStatus === "failed") summary.emailsFailed += 1;
    else summary.emailsSkipped += 1;
    return true;
  }

  if (settings.due_reminders) {
    const due = await sql<LoanNotificationRow[]>`
      select
        l.id as loan_id,
        l.member_id,
        m.name as member_name,
        m.member_code,
        m.email as member_email,
        b.title as book_title,
        b.book_code,
        to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
        to_char(l.due_on, 'DD Mon YYYY') as due,
        to_char(l.due_on, 'YYYY-MM-DD') as due_iso,
        null::text as returned,
        (l.due_on - current_date)::int as days_until,
        (current_date - l.due_on)::int as days_overdue
      from loans l
      join members m on m.id = l.member_id
      join books b on b.id = l.book_id
      where l.returned_on is null
        and l.due_on >= current_date
        and l.due_on <= current_date + ${settings.reminder_days_before}::int
      order by l.due_on, l.id
    `;

    for (const loan of due) {
      const when =
        loan.days_until === 0
          ? `today (${loan.due})`
          : `on ${loan.due} (in ${loan.days_until} ${
              loan.days_until === 1 ? "day" : "days"
            })`;

      const created = await record({
        dedupeKey: `due_reminder:${loan.loan_id}:${loan.due_iso}`,
        type: "due_reminder",
        audience: "member",
        memberId: loan.member_id,
        loanId: loan.loan_id,
        recipient: loan.member_email,
        subject: `Due-date reminder · ${loan.book_title}`,
        body: [
          `Hello ${loan.member_name},`,
          "",
          `This is a reminder that "${loan.book_title}" (${loan.book_code}) is due ${when}.`,
          "",
          loanHeader(loan),
          "",
          "Return or renew it by the due date to avoid a late-return fine.",
          "",
          `${identity.name} Manager`,
        ].join("\n"),
        emailEnabled: settings.email_enabled,
      });
      if (created) summary.dueReminders += 1;
    }
  }

  const overdue = await sql<LoanNotificationRow[]>`
    select
      l.id as loan_id,
      l.member_id,
      m.name as member_name,
      m.member_code,
      m.email as member_email,
      b.title as book_title,
      b.book_code,
      to_char(l.borrowed_on, 'DD Mon YYYY') as borrowed,
      to_char(l.due_on, 'DD Mon YYYY') as due,
      to_char(l.due_on, 'YYYY-MM-DD') as due_iso,
      null::text as returned,
      (l.due_on - current_date)::int as days_until,
      (coalesce(l.returned_on, current_date) - l.due_on)::int as days_overdue
    from loans l
    join members m on m.id = l.member_id
    join books b on b.id = l.book_id
    where l.returned_on is null and l.due_on < current_date
    order by l.due_on, l.id
  `;

  if (settings.overdue_notices) {
    for (const loan of overdue) {
      const created = await record({
        dedupeKey: `overdue_notice:${loan.loan_id}:${clock.today}`,
        type: "overdue_notice",
        audience: "member",
        memberId: loan.member_id,
        loanId: loan.loan_id,
        recipient: loan.member_email,
        subject: `Overdue notice · ${loan.book_title}`,
        body: [
          `Hello ${loan.member_name},`,
          "",
          `Our records show that "${loan.book_title}" (${loan.book_code}) was due on ${loan.due} and is now ${loan.days_overdue} ${
            loan.days_overdue === 1 ? "day" : "days"
          } overdue.`,
          "",
          loanHeader(loan),
          "",
          "Please return the book as soon as possible or contact the library.",
          "",
          `${identity.name} Manager`,
        ].join("\n"),
        emailEnabled: settings.email_enabled,
      });
      if (created) summary.overdueNotices += 1;
    }
  }

  if (settings.admin_overdue_alerts && overdue.length > 0) {
    const lines = overdue.map(
      (loan) =>
        `- ${loan.member_name} (${loan.member_code}) · "${loan.book_title}" (${loan.book_code}) · due ${loan.due} · ${loan.days_overdue} ${
          loan.days_overdue === 1 ? "day" : "days"
        } overdue`
    );

    const created = await record({
      dedupeKey: `admin_overdue_alert:${clock.today}`,
      type: "admin_overdue_alert",
      audience: "admin",
      memberId: null,
      loanId: null,
      recipient: settings.admin_email,
      subject: `Overdue alert · ${overdue.length} ${
        overdue.length === 1 ? "loan" : "loans"
      } as of ${clock.label}`,
      body: [
        `Overdue loans as of ${clock.label}:`,
        "",
        ...lines,
        "",
        `Total: ${overdue.length} overdue ${
          overdue.length === 1 ? "loan" : "loans"
        }.`,
        "",
        `${identity.name} Manager`,
      ].join("\n"),
      emailEnabled: settings.email_enabled,
    });
    if (created) summary.adminAlerts += 1;
  }

  const summaryText = describeRun(summary);

  await sql`
    update notification_settings
    set last_run_at = now(), last_run_summary = ${summaryText}
    where id
  `;

  revalidatePath("/notifications");
  return summary;
}
