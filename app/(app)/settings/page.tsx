import { connection } from "next/server";
import { Info } from "lucide-react";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission, ROLE_LABELS } from "@/lib/auth/permissions";
import { loadNotificationSettings } from "@/lib/notifications";
import {
  getLendingSettings,
  getLibraryIdentity,
  todayHoursLabel,
} from "@/lib/settings";
import { PageIntro } from "@/components/ui";
import FinePolicyForm from "../fines/fine-policy-form";
import NotificationSettingsForm from "../notifications/notification-settings-form";
import {
  CategoriesPanel,
  GeneralPreferencesForm,
  LendingPolicyForm,
  LibraryProfileForm,
  OpeningHoursForm,
} from "./settings-forms";

export const metadata = {
  title: "System settings",
};

// settings are read per request so saved changes are reflected immediately
export const instant = false;

type CategoryRow = {
  id: number;
  name: string;
  book_count: number;
};

const SECTIONS = [
  { href: "#profile", label: "Library profile" },
  { href: "#lending", label: "Lending and membership" },
  { href: "#fines", label: "Fines" },
  { href: "#notifications", label: "Notifications" },
  { href: "#categories", label: "Categories" },
  { href: "#hours", label: "Opening hours" },
  { href: "#general", label: "General" },
];

export default async function SettingsPage() {
  await connection();
  const user = await requirePagePermission("settings.manage");
  const canManageCategories = hasPermission(user, "books.manage");
  const canManageNotifications = hasPermission(user, "notifications.manage");

  const [identity, lending, notificationSettings, categories] = await Promise.all(
    [
      getLibraryIdentity(),
      getLendingSettings(),
      loadNotificationSettings(),
      sql<CategoryRow[]>`
        select
          c.id,
          c.name,
          count(b.id)::int as book_count
        from categories c
        left join books b on b.category_id = c.id
        group by c.id, c.name
        order by lower(c.name)
      `,
    ]
  );

  return (
    <div className="space-y-6">
      <PageIntro>
        Configure how {identity.name} looks and behaves across the app.
      </PageIntro>

      <div className="flex items-start gap-3 rounded-xl border border-brand-soft-border bg-brand-soft p-4 text-sm text-brand sm:p-5 dark:text-foreground">
        <Info size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
        <div>
          <p>
            Signed in as{" "}
            <span className="font-medium">{user.name}</span> (
            {ROLE_LABELS[user.role]}). Changes are validated before saving,
            applied immediately and recorded in the audit trail.
          </p>
          <p className="mt-1">
            Open today:{" "}
            <span className="font-medium">
              {todayHoursLabel(identity.openingHours)}
            </span>
            {identity.contactEmail ? ` · ${identity.contactEmail}` : ""}
          </p>
        </div>
      </div>

      <nav
        aria-label="Settings sections"
        className="flex flex-wrap gap-2 text-sm"
      >
        {SECTIONS.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="rounded-full border border-line px-3 py-1.5 text-muted-strong transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-foreground"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <div className="grid gap-6">
        <section id="profile" className="scroll-mt-6">
          <LibraryProfileForm
            name={identity.name}
            contactEmail={identity.contactEmail}
            contactPhone={identity.contactPhone}
            contactAddress={identity.contactAddress}
            website={identity.website}
          />
        </section>

        <section id="lending" className="scroll-mt-6">
          <LendingPolicyForm
            defaultLoanDays={lending.defaultLoanDays}
            defaultMemberLimit={lending.defaultMemberLimit}
            maxMemberLimit={lending.maxMemberLimit}
            membershipMonths={lending.membershipMonths}
          />
        </section>

        <section id="fines" className="scroll-mt-6">
          <FinePolicyForm
            enabled={lending.fineEnabled}
            finePerDay={lending.finePerDay}
            fineGraceDays={lending.fineGraceDays}
          />
        </section>

        <section id="notifications" className="scroll-mt-6">
          {canManageNotifications ? (
            <NotificationSettingsForm
              emailEnabled={notificationSettings.email_enabled}
              borrowingConfirmation={notificationSettings.borrowing_confirmation}
              returnConfirmation={notificationSettings.return_confirmation}
              dueReminders={notificationSettings.due_reminders}
              overdueNotices={notificationSettings.overdue_notices}
              suspensionNotices={notificationSettings.suspension_notices}
              adminOverdueAlerts={notificationSettings.admin_overdue_alerts}
              reminderDaysBefore={notificationSettings.reminder_days_before}
              adminEmail={notificationSettings.admin_email}
            />
          ) : (
            <div className="card p-5 text-sm text-muted">
              <h2 className="font-semibold text-foreground">
                Notification preferences
              </h2>
              <p className="mt-1">
                Your role cannot change notification delivery. Ask an
                administrator with the notifications permission to update these
                preferences.
              </p>
            </div>
          )}
        </section>

        <div id="categories" className="scroll-mt-6">
          <CategoriesPanel
            categories={categories}
            canManage={canManageCategories}
          />
        </div>

        <section id="hours" className="scroll-mt-6">
          <OpeningHoursForm openingHours={identity.openingHours} />
        </section>

        <section id="general" className="scroll-mt-6">
          <GeneralPreferencesForm
            currencySymbol={identity.currencySymbol}
            noticeText={identity.noticeText}
          />
        </section>
      </div>
    </div>
  );
}
