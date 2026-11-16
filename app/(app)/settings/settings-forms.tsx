"use client";

import { useActionState, useState } from "react";
import {
  Building2,
  Clock,
  BookOpen,
  Settings2,
  Tags,
} from "lucide-react";
import ConfirmDialog, { DialogSubmit } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/ui";
import LibraryLogo from "@/components/library-logo";
import {
  addCategory,
  deleteCategory,
  renameCategory,
  updateGeneralPreferences,
  updateLendingPolicy,
  updateLibraryProfile,
  updateOpeningHours,
  type SettingsFormState,
} from "./actions";

const initial: SettingsFormState = { message: "" };

type DayHours = { open: string; close: string };
type OpeningHours = Record<string, DayHours | null>;

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

function FormHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}

function Feedback({ state }: { state: SettingsFormState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}
    >
      {state.message}
    </p>
  );
}

export function LibraryProfileForm({
  name,
  contactEmail,
  contactPhone,
  contactAddress,
  website,
}: {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  website: string | null;
}) {
  const [state, action, pending] = useActionState(
    updateLibraryProfile,
    initial
  );

  return (
    <form action={action} className="card grid gap-5 p-5">
      <FormHeading
        icon={Building2}
        title="Library profile"
        description="Manage the library name and contact details shown throughout the application and exported reports."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="label">Library name</span>
          <input
            name="libraryName"
            required
            maxLength={120}
            defaultValue={name}
            className="field w-full"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="label">Website (optional)</span>
          <input
            name="website"
            type="url"
            maxLength={200}
            defaultValue={website ?? ""}
            placeholder="https://example.org"
            className="field w-full"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="label">Contact email (optional)</span>
          <input
            name="contactEmail"
            type="email"
            maxLength={254}
            defaultValue={contactEmail ?? ""}
            placeholder="hello@example.org"
            className="field w-full"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="label">Contact phone (optional)</span>
          <input
            name="contactPhone"
            inputMode="tel"
            maxLength={40}
            defaultValue={contactPhone ?? ""}
            placeholder="e.g. +234 801 234 5678"
            className="field w-full"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="label">Contact address (optional)</span>
        <textarea
          name="contactAddress"
          rows={2}
          maxLength={500}
          defaultValue={contactAddress ?? ""}
          className="field w-full"
        />
      </label>

      <div className="grid gap-4 rounded-lg border border-line bg-surface-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <LibraryLogo className="h-20 w-36" />
        <div className="text-sm">
          <p className="font-medium">Library logo</p>
          <p className="mt-1 text-muted">
            The logo automatically matches the light or dark theme. Report PDFs
            use the blue logo.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn btn-secondary">
          {pending ? "Saving..." : "Save library profile"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function LendingPolicyForm({
  defaultLoanDays,
  defaultMemberLimit,
  maxMemberLimit,
  membershipMonths,
}: {
  defaultLoanDays: number;
  defaultMemberLimit: number;
  maxMemberLimit: number;
  membershipMonths: number;
}) {
  const [state, action, pending] = useActionState(
    updateLendingPolicy,
    initial
  );

  return (
    <form action={action} className="card grid gap-5 p-5">
      <FormHeading
        icon={BookOpen}
        title="Lending and membership"
        description="These defaults apply to new loans and new member registrations. Member limits cannot exceed the system maximum."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">
          <span className="label">Default loan period (days)</span>
          <input
            name="defaultLoanDays"
            type="number"
            min={1}
            max={365}
            required
            defaultValue={defaultLoanDays}
            className="field w-full"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="label">Default member limit</span>
          <input
            name="defaultMemberLimit"
            type="number"
            min={0}
            max={100}
            required
            defaultValue={defaultMemberLimit}
            className="field w-full"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="label">Maximum member limit</span>
          <input
            name="maxMemberLimit"
            type="number"
            min={0}
            max={100}
            required
            defaultValue={maxMemberLimit}
            className="field w-full"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="label">Membership validity (months)</span>
          <input
            name="membershipMonths"
            type="number"
            min={0}
            max={120}
            required
            defaultValue={membershipMonths}
            className="field w-full"
          />
        </label>
      </div>

      <p className="hint">
        Set membership validity to 0 for memberships that never expire. With a
        positive value, new members receive an expiry date and lapsed
        memberships are blocked from borrowing until renewed.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn btn-secondary">
          {pending ? "Saving..." : "Save lending policy"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function OpeningHoursForm({
  openingHours,
}: {
  openingHours: OpeningHours;
}) {
  const [state, action, pending] = useActionState(
    updateOpeningHours,
    initial
  );

  return (
    <form action={action} className="card grid gap-5 p-5">
      <FormHeading
        icon={Clock}
        title="Opening hours"
        description="Shown on the sign-in screen and in the navigation bar. Mark a day closed when the library does not open."
      />

      <div className="grid gap-2">
        {DAYS.map((day) => {
          const entry = openingHours[day.key] ?? null;
          return (
            <div
              key={day.key}
              className="grid items-center gap-2 rounded-lg border border-line bg-surface-2 p-2.5 text-sm sm:grid-cols-[8rem_auto_auto_auto]"
            >
              <span className="font-medium">{day.label}</span>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  name={`closed_${day.key}`}
                  defaultChecked={!entry}
                  className="h-4 w-4"
                />
                Closed
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                Opens
                <input
                  type="time"
                  name={`open_${day.key}`}
                  defaultValue={entry?.open ?? "09:00"}
                  className="field field-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                Closes
                <input
                  type="time"
                  name={`close_${day.key}`}
                  defaultValue={entry?.close ?? "17:00"}
                  className="field field-sm"
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn btn-secondary">
          {pending ? "Saving..." : "Save opening hours"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function GeneralPreferencesForm({
  currencySymbol,
  noticeText,
}: {
  currencySymbol: string;
  noticeText: string | null;
}) {
  const [state, action, pending] = useActionState(
    updateGeneralPreferences,
    initial
  );

  return (
    <form action={action} className="card grid gap-5 p-5">
      <FormHeading
        icon={Settings2}
        title="General preferences"
        description="The currency symbol is used for fines and every money column in reports and exports. The notice appears in the app shell."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="label">Currency symbol</span>
          <input
            name="currencySymbol"
            maxLength={4}
            defaultValue={currencySymbol}
            placeholder="e.g. $ or ₦"
            className="field w-40"
          />
          <span className="hint">
            Up to 4 characters. Leave empty to show plain amounts.
          </span>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="label">Library notice (optional)</span>
          <textarea
            name="noticeText"
            rows={2}
            maxLength={240}
            defaultValue={noticeText ?? ""}
            placeholder="e.g. The library is closed on public holidays."
            className="field w-full"
          />
          <span className="hint">
            Up to 240 characters, shown below the navigation bar.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn btn-secondary">
          {pending ? "Saving..." : "Save general preferences"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

type Category = { id: number; name: string; book_count: number };

function CategoryRow({ category }: { category: Category }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renameState, renameAction, renaming] = useActionState(
    renameCategory,
    initial
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteCategory,
    initial
  );

  return (
    <li className="grid gap-2 border-b border-line py-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <form action={renameAction} className="flex min-w-0 flex-1 gap-2">
          <input type="hidden" name="id" value={category.id} />
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={category.name}
            aria-label={`Rename ${category.name}`}
            className="field w-full"
          />
          <button
            disabled={renaming}
            className="btn btn-sm btn-secondary whitespace-nowrap"
          >
            {renaming ? "Saving..." : "Rename"}
          </button>
        </form>
        <span className="badge badge-neutral whitespace-nowrap">
          {category.book_count}{" "}
          {category.book_count === 1 ? "book" : "books"}
        </span>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={deleting}
          className="btn btn-sm btn-danger whitespace-nowrap"
        >
          Delete
        </button>
      </div>
      <Feedback state={renameState} />
      <Feedback state={deleteState} />

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete “${category.name}”?`}
          description="Books in this category must be reassigned first. This action cannot be undone."
          onClose={() => setConfirmingDelete(false)}
        >
          <form action={deleteAction} className="contents">
            <input type="hidden" name="id" value={category.id} />
            <DialogSubmit pendingLabel="Deleting...">
              Delete category
            </DialogSubmit>
          </form>
        </ConfirmDialog>
      )}
    </li>
  );
}

export function CategoriesPanel({
  categories,
  canManage,
}: {
  categories: Category[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(addCategory, initial);

  return (
    <section className="card p-5" aria-labelledby="settings-categories">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Tags size={16} aria-hidden="true" />
        </span>
        <div>
          <h2 id="settings-categories" className="font-semibold">
            Book categories
          </h2>
          <p className="mt-1 text-sm text-muted">
            Categories group the catalogue and drive category filters in
            reports. Categories in use cannot be deleted until their books are
            reassigned.
          </p>
        </div>
      </div>

      {canManage && (
        <form action={action} className="mt-4 flex flex-wrap items-start gap-2">
          <input
            name="name"
            required
            maxLength={80}
            placeholder="New category name"
            aria-label="New category name"
            className="field w-full max-w-xs"
          />
          <button disabled={pending} className="btn btn-secondary">
            {pending ? "Adding..." : "Add category"}
          </button>
          <Feedback state={state} />
        </form>
      )}

      {categories.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Tags}
            title="No categories yet"
            description="Add a category to start organising the catalogue."
          />
        </div>
      ) : (
        <ul className="mt-4">
          {categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
      )}
    </section>
  );
}
