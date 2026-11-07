"use client";

import { useActionState } from "react";
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

function Feedback({ state }: { state: SettingsFormState }) {
  if (!state.message) return null;
  return (
    <p className={`text-sm ${state.ok ? "text-green-600" : "text-red-500"}`}>
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
  logoDataUrl,
}: {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  website: string | null;
  logoDataUrl: string | null;
}) {
  const [state, action, pending] = useActionState(
    updateLibraryProfile,
    initial
  );

  return (
    <form action={action} className="grid gap-4 rounded-lg border p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">Library profile</h2>
        <p className="mt-1 text-sm text-gray-500">
          The name and logo appear in the navigation, page titles, sign-in
          screens and exported reports.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Library name</span>
          <input
            name="libraryName"
            required
            maxLength={120}
            defaultValue={name}
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Website (optional)</span>
          <input
            name="website"
            type="url"
            maxLength={200}
            defaultValue={website ?? ""}
            placeholder="https://example.org"
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Contact email (optional)</span>
          <input
            name="contactEmail"
            type="email"
            maxLength={254}
            defaultValue={contactEmail ?? ""}
            placeholder="hello@example.org"
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Contact phone (optional)</span>
          <input
            name="contactPhone"
            inputMode="tel"
            maxLength={40}
            defaultValue={contactPhone ?? ""}
            placeholder="e.g. +234 801 234 5678"
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-gray-500">Contact address (optional)</span>
        <textarea
          name="contactAddress"
          rows={2}
          maxLength={500}
          defaultValue={contactAddress ?? ""}
          className="w-full min-w-0 rounded border bg-transparent p-2"
        />
      </label>

      <div className="grid gap-3 rounded border p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <div className="flex h-20 w-32 items-center justify-center rounded border bg-gray-50 p-2 dark:bg-gray-900">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoDataUrl}
              alt="Current library logo"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-gray-500">No logo</span>
          )}
        </div>
        <div className="grid gap-2 text-sm">
          <label className="grid gap-1">
            <span className="text-gray-500">Logo</span>
            <input
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
            />
          </label>
          <p className="text-xs text-gray-500">
            PNG, JPEG or WebP, up to 300 KB. Uploading a new file replaces the
            current logo.
          </p>
          {logoDataUrl && (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="removeLogo" className="h-4 w-4" />
              Remove the current logo
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
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
    <form action={action} className="grid gap-4 rounded-lg border p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">Lending and membership</h2>
        <p className="mt-1 text-sm text-gray-500">
          These defaults apply to new loans and new member registrations. Member
          limits cannot exceed the system maximum.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Default loan period (days)</span>
          <input
            name="defaultLoanDays"
            type="number"
            min={1}
            max={365}
            required
            defaultValue={defaultLoanDays}
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Default member limit</span>
          <input
            name="defaultMemberLimit"
            type="number"
            min={0}
            max={100}
            required
            defaultValue={defaultMemberLimit}
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Maximum member limit</span>
          <input
            name="maxMemberLimit"
            type="number"
            min={0}
            max={100}
            required
            defaultValue={maxMemberLimit}
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Membership validity (months)</span>
          <input
            name="membershipMonths"
            type="number"
            min={0}
            max={120}
            required
            defaultValue={membershipMonths}
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
        </label>
      </div>

      <p className="text-xs text-gray-500">
        Set membership validity to 0 for memberships that never expire. With a
        positive value, new members receive an expiry date and lapsed
        memberships are blocked from borrowing until renewed.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
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
    <form action={action} className="grid gap-4 rounded-lg border p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">Opening hours</h2>
        <p className="mt-1 text-sm text-gray-500">
          Shown on the sign-in screen and in the navigation bar. Mark a day
          closed when the library does not open.
        </p>
      </div>

      <div className="grid gap-2">
        {DAYS.map((day) => {
          const entry = openingHours[day.key] ?? null;
          return (
            <div
              key={day.key}
              className="grid items-center gap-2 rounded border p-2 text-sm sm:grid-cols-[8rem_auto_auto_auto]"
            >
              <span className="font-medium">{day.label}</span>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                <input
                  type="checkbox"
                  name={`closed_${day.key}`}
                  defaultChecked={!entry}
                  className="h-4 w-4"
                />
                Closed
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                Opens
                <input
                  type="time"
                  name={`open_${day.key}`}
                  defaultValue={entry?.open ?? "09:00"}
                  className="rounded border bg-transparent p-1.5"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                Closes
                <input
                  type="time"
                  name={`close_${day.key}`}
                  defaultValue={entry?.close ?? "17:00"}
                  className="rounded border bg-transparent p-1.5"
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
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
    <form action={action} className="grid gap-4 rounded-lg border p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">General preferences</h2>
        <p className="mt-1 text-sm text-gray-500">
          The currency symbol is used for fines and every money column in
          reports and exports. The notice appears in the app shell.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Currency symbol</span>
          <input
            name="currencySymbol"
            maxLength={4}
            defaultValue={currencySymbol}
            placeholder="e.g. $ or ₦"
            className="w-40 rounded border bg-transparent p-2"
          />
          <span className="text-xs text-gray-500">
            Up to 4 characters. Leave empty to show plain amounts.
          </span>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-500">Library notice (optional)</span>
          <textarea
            name="noticeText"
            rows={2}
            maxLength={240}
            defaultValue={noticeText ?? ""}
            placeholder="e.g. The library is closed on public holidays."
            className="w-full min-w-0 rounded border bg-transparent p-2"
          />
          <span className="text-xs text-gray-500">
            Up to 240 characters, shown below the navigation bar.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save general preferences"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

type Category = { id: number; name: string; book_count: number };

function CategoryRow({ category }: { category: Category }) {
  const [renameState, renameAction, renaming] = useActionState(
    renameCategory,
    initial
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteCategory,
    initial
  );

  return (
    <li className="grid gap-2 border-b py-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <form action={renameAction} className="flex min-w-0 flex-1 gap-2">
          <input type="hidden" name="id" value={category.id} />
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={category.name}
            aria-label={`Rename ${category.name}`}
            className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
          />
          <button
            disabled={renaming}
            className="whitespace-nowrap rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {renaming ? "Saving..." : "Rename"}
          </button>
        </form>
        <span className="whitespace-nowrap text-xs text-gray-500">
          {category.book_count}{" "}
          {category.book_count === 1 ? "book" : "books"}
        </span>
        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (
              !confirm(
                `Delete the "${category.name}" category? This cannot be undone.`
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={category.id} />
          <button
            disabled={deleting}
            className="whitespace-nowrap text-sm text-red-500 underline disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </form>
      </div>
      <Feedback state={renameState} />
      <Feedback state={deleteState} />
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
    <section
      className="rounded-lg border p-4 sm:p-5"
      aria-labelledby="settings-categories"
    >
      <h2 id="settings-categories" className="font-semibold">
        Book categories
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Categories group the catalogue and drive category filters in reports.
        Categories in use cannot be deleted until their books are reassigned.
      </p>

      {canManage && (
        <form
          action={action}
          className="mt-4 flex flex-wrap items-start gap-2"
        >
          <input
            name="name"
            required
            maxLength={80}
            placeholder="New category name"
            aria-label="New category name"
            className="w-full max-w-xs min-w-0 rounded border bg-transparent p-2 text-sm"
          />
          <button
            disabled={pending}
            className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Adding..." : "Add category"}
          </button>
          <Feedback state={state} />
        </form>
      )}

      {categories.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No categories yet.</p>
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
