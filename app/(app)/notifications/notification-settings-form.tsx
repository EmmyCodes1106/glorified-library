"use client";

import { useActionState } from "react";
import { BellRing } from "lucide-react";
import { updateNotificationSettings, type FormState } from "@/app/actions";

const initial: FormState = { message: "" };

type Props = {
  emailEnabled: boolean;
  borrowingConfirmation: boolean;
  returnConfirmation: boolean;
  dueReminders: boolean;
  overdueNotices: boolean;
  suspensionNotices: boolean;
  adminOverdueAlerts: boolean;
  reminderDaysBefore: number;
  adminEmail: string | null;
};

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2 p-3 text-sm transition-colors hover:border-line-strong">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

export default function NotificationSettingsForm({
  emailEnabled,
  borrowingConfirmation,
  returnConfirmation,
  dueReminders,
  overdueNotices,
  suspensionNotices,
  adminOverdueAlerts,
  reminderDaysBefore,
  adminEmail,
}: Props) {
  const [state, action, pending] = useActionState(
    updateNotificationSettings,
    initial
  );

  return (
    <form action={action} className="card grid gap-5 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <BellRing size={16} />
        </span>
        <div>
          <h2 className="font-semibold">Notification preferences</h2>
          <p className="mt-1 text-sm text-muted">
            Each event is recorded in the notification history. Email delivery
            is an additional channel controlled below.
          </p>
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          Member notifications
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            name="borrowingConfirmation"
            label="Borrowing confirmations"
            hint="Sent when a book is issued."
            defaultChecked={borrowingConfirmation}
          />
          <Toggle
            name="returnConfirmation"
            label="Return confirmations"
            hint="Sent when a return is recorded."
            defaultChecked={returnConfirmation}
          />
          <Toggle
            name="dueReminders"
            label="Upcoming due reminders"
            hint="Sent within the lead time before the due date."
            defaultChecked={dueReminders}
          />
          <Toggle
            name="overdueNotices"
            label="Overdue notices"
            hint="Sent daily while a loan stays overdue."
            defaultChecked={overdueNotices}
          />
          <Toggle
            name="suspensionNotices"
            label="Suspension notices"
            hint="Sent when a membership is suspended."
            defaultChecked={suspensionNotices}
          />
        </div>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">
            Send due reminders this many days early
          </span>
          <input
            type="number"
            name="reminderDaysBefore"
            min={0}
            max={30}
            required
            defaultValue={reminderDaysBefore}
            className="field w-20"
          />
        </label>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Administrator</legend>
        <Toggle
          name="adminOverdueAlerts"
          label="Daily overdue alert"
          hint="One summary email per day listing every overdue loan."
          defaultChecked={adminOverdueAlerts}
        />
        <label className="grid gap-1 text-sm">
          <span className="label">Administrator email</span>
          <input
            type="email"
            name="adminEmail"
            maxLength={254}
            defaultValue={adminEmail ?? ""}
            placeholder="librarian@example.com"
            className="field w-full max-w-sm"
          />
          <span className="hint">
            Required when the daily overdue alert is enabled. Never shown to
            members.
          </span>
        </label>
      </fieldset>

      <Toggle
        name="emailEnabled"
        label="Send email"
        hint="Turning this off keeps recording notifications but marks email delivery as skipped."
        defaultChecked={emailEnabled}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn btn-secondary">
          {pending ? "Saving..." : "Save preferences"}
        </button>
        {state.message && (
          <p
            role={state.ok ? "status" : "alert"}
            className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
