"use server";

import { revalidatePath } from "next/cache";
import sql from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logAudit } from "@/lib/auth/audit";
import {
  DAY_KEYS,
  DAY_LABELS,
  timeIsValid,
  type DayKey,
  type OpeningHours,
} from "@/lib/settings";

export type SettingsFormState = { message: string; ok?: boolean };

const LOGO_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
  ["image/webp", "webp"],
]);
const MAX_LOGO_BYTES = 300 * 1024;

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function wholeNumber(formData: FormData, name: string) {
  const value = text(formData, name);
  if (!/^\d{1,3}$/.test(value)) return null;
  return Number(value);
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validWebsite(value: string) {
  if (value.length > 200) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

type LogoResult = { error: string } | { value: string } | null;

async function readLogo(formData: FormData): Promise<LogoResult> {
  const value = formData.get("logo");
  if (!(value instanceof File) || value.size === 0) return null;

  if (!LOGO_TYPES.has(value.type)) {
    return { error: "The logo must be a PNG, JPEG or WebP image." };
  }
  if (value.size > MAX_LOGO_BYTES) {
    return { error: "Logo images must be 300 KB or smaller." };
  }

  const bytes = Buffer.from(await value.arrayBuffer());
  return {
    value: `data:${value.type};base64,${bytes.toString("base64")}`,
  };
}

export async function updateLibraryProfile(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const access = await authorize("settings.manage", "change library details");
  if (!access.ok) return { message: access.message };

  const name = text(formData, "libraryName");
  const email = text(formData, "contactEmail");
  const phone = text(formData, "contactPhone");
  const address = text(formData, "contactAddress");
  const website = text(formData, "website");

  if (!name) return { message: "Please enter the library name." };
  if (name.length > 120) {
    return { message: "The library name must be 120 characters or fewer." };
  }
  if (email && !validEmail(email)) {
    return { message: "Enter a valid contact email address, or leave it empty." };
  }
  if (phone && !/^[0-9+\-()\s]{6,40}$/.test(phone)) {
    return {
      message: "Enter a valid contact phone number, or leave it empty.",
    };
  }
  if (address.length > 500) {
    return { message: "The contact address must be 500 characters or fewer." };
  }
  if (website && !validWebsite(website)) {
    return {
      message: "Enter a full website address starting with http:// or https://.",
    };
  }

  const removeLogo = formData.get("removeLogo") === "on";
  const logo = await readLogo(formData);
  if (logo && "error" in logo) return { message: logo.error };

  const [existing] = await sql<{ logo_data_url: string | null }[]>`
    select logo_data_url from library_settings where id
  `;
  const nextLogo =
    logo && "value" in logo
      ? logo.value
      : removeLogo
        ? null
        : existing?.logo_data_url ?? null;

  await sql`
    update library_settings
    set
      library_name = ${name},
      contact_email = ${email || null},
      contact_phone = ${phone || null},
      contact_address = ${address || null},
      website = ${website || null},
      logo_data_url = ${nextLogo},
      updated_at = now()
    where id
  `;

  await logAudit({
    action: "settings.profile_updated",
    entityType: "settings",
    entityId: "library",
    summary: `${access.user.name} updated the library profile`,
    actor: access.user,
    metadata: {
      name,
      contactEmail: email || null,
      logoChanged: Boolean(
        (logo && "value" in logo) || (removeLogo && existing?.logo_data_url)
      ),
    },
  });

  revalidatePath("/", "layout");
  return { message: "Library details saved.", ok: true };
}

export async function updateLendingPolicy(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const access = await authorize("settings.manage", "change lending policy");
  if (!access.ok) return { message: access.message };

  const loanDays = wholeNumber(formData, "defaultLoanDays");
  const defaultLimit = wholeNumber(formData, "defaultMemberLimit");
  const maxLimit = wholeNumber(formData, "maxMemberLimit");
  const months = wholeNumber(formData, "membershipMonths");

  if (loanDays === null || loanDays < 1 || loanDays > 365) {
    return {
      message: "Default borrowing period must be between 1 and 365 days.",
    };
  }
  if (defaultLimit === null || defaultLimit > 100) {
    return {
      message: "The default borrowing limit must be a whole number from 0 to 100.",
    };
  }
  if (maxLimit === null || maxLimit > 100) {
    return {
      message: "The maximum borrowing limit must be a whole number from 0 to 100.",
    };
  }
  if (defaultLimit > maxLimit) {
    return {
      message: "The default borrowing limit cannot exceed the maximum limit.",
    };
  }
  if (months === null || months > 120) {
    return {
      message: "Membership validity must be a whole number of months from 0 to 120.",
    };
  }

  await sql.begin(async (tx) => {
    await tx`
      update circulation_settings
      set default_loan_days = ${loanDays}, updated_at = now()
      where id
    `;
    await tx`
      update library_settings
      set
        default_member_limit = ${defaultLimit},
        max_member_limit = ${maxLimit},
        membership_months = ${months},
        updated_at = now()
      where id
    `;
  });

  await logAudit({
    action: "settings.lending_updated",
    entityType: "settings",
    entityId: "lending",
    summary: `${access.user.name} updated lending and membership policy`,
    actor: access.user,
    metadata: {
      defaultLoanDays: loanDays,
      defaultMemberLimit: defaultLimit,
      maxMemberLimit: maxLimit,
      membershipMonths: months,
    },
  });

  revalidatePath("/", "layout");
  return {
    message:
      months > 0
        ? `Lending policy saved. New memberships last ${months} months.`
        : "Lending policy saved. Memberships do not expire by default.",
    ok: true,
  };
}

export async function updateOpeningHours(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const access = await authorize("settings.manage", "change opening hours");
  if (!access.ok) return { message: access.message };

  const hours = {} as OpeningHours;

  for (const day of DAY_KEYS) {
    if (formData.get(`closed_${day}`) === "on") {
      hours[day] = null;
      continue;
    }
    const open = text(formData, `open_${day}`);
    const close = text(formData, `close_${day}`);
    if (!timeIsValid(open) || !timeIsValid(close)) {
      return {
        message: `Enter open and close times for ${DAY_LABELS[day]}, or mark it closed.`,
      };
    }
    if (open >= close) {
      return {
        message: `${DAY_LABELS[day]} closing time must be later than the opening time.`,
      };
    }
    hours[day] = { open, close };
  }

  await sql`
    update library_settings
    set opening_hours = ${sql.json(hours)}, updated_at = now()
    where id
  `;

  const openCount = DAY_KEYS.filter((day: DayKey) => hours[day]).length;

  await logAudit({
    action: "settings.opening_hours_updated",
    entityType: "settings",
    entityId: "opening-hours",
    summary: `${access.user.name} updated library opening hours`,
    actor: access.user,
    metadata: { openDays: openCount },
  });

  revalidatePath("/", "layout");
  return {
    message: `Opening hours saved · ${openCount} ${
      openCount === 1 ? "day" : "days"
    } open each week.`,
    ok: true,
  };
}

export async function updateGeneralPreferences(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const access = await authorize(
    "settings.manage",
    "change general preferences"
  );
  if (!access.ok) return { message: access.message };

  const currencySymbol = text(formData, "currencySymbol");
  const notice = text(formData, "noticeText");

  if ([...currencySymbol].length > 4) {
    return {
      message: "The currency symbol must be 4 characters or fewer.",
    };
  }
  if (notice.length > 240) {
    return { message: "The notice must be 240 characters or fewer." };
  }

  await sql`
    update library_settings
    set
      currency_symbol = ${currencySymbol},
      notice_text = ${notice || null},
      updated_at = now()
    where id
  `;

  await logAudit({
    action: "settings.general_updated",
    entityType: "settings",
    entityId: "general",
    summary: `${access.user.name} updated general preferences`,
    actor: access.user,
    metadata: { currencySymbol, notice: Boolean(notice) },
  });

  revalidatePath("/", "layout");
  return { message: "General preferences saved.", ok: true };
}

const CATEGORY_LIMIT = 80;

function checkCategoryName(
  formData: FormData
): { error: string } | { name: string } {
  const name = text(formData, "name");
  if (!name) return { error: "Please enter a category name." };
  if (name.length > CATEGORY_LIMIT) {
    return {
      error: `Category names must be ${CATEGORY_LIMIT} characters or fewer.`,
    };
  }
  return { name };
}

export async function addCategory(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const access = await authorize("books.manage", "add a book category");
  if (!access.ok) return { message: access.message };

  const checked = checkCategoryName(formData);
  if ("error" in checked) return { message: checked.error };

  const [existing] = await sql`
    select id from categories where lower(name) = lower(${checked.name})
  `;
  if (existing) {
    return { message: `"${checked.name}" already exists as a category.` };
  }

  const [created] = await sql`
    insert into categories (name) values (${checked.name})
    on conflict do nothing
    returning id
  `;
  if (!created) {
    return { message: `"${checked.name}" already exists as a category.` };
  }

  await logAudit({
    action: "category.created",
    entityType: "category",
    entityId: created.id as number,
    summary: `${access.user.name} added category "${checked.name}"`,
    actor: access.user,
  });

  revalidatePath("/", "layout");
  return { message: `Category "${checked.name}" added.`, ok: true };
}

export async function renameCategory(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const access = await authorize("books.manage", "rename a book category");
  if (!access.ok) return { message: access.message };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id < 1) {
    return { message: "Category not found." };
  }

  const checked = checkCategoryName(formData);
  if ("error" in checked) return { message: checked.error };

  const [existing] = await sql<{ name: string }[]>`
    select name from categories where id = ${id}
  `;
  if (!existing) return { message: "Category not found." };
  if (existing.name === checked.name) {
    return { message: "That is already the category name.", ok: true };
  }

  const [duplicate] = await sql`
    select id from categories
    where lower(name) = lower(${checked.name}) and id <> ${id}
  `;
  if (duplicate) {
    return { message: `"${checked.name}" already exists as a category.` };
  }

  await sql`
    update categories set name = ${checked.name} where id = ${id}
  `;

  await logAudit({
    action: "category.renamed",
    entityType: "category",
    entityId: id,
    summary: `${access.user.name} renamed category "${existing.name}" to "${checked.name}"`,
    actor: access.user,
    metadata: { previousName: existing.name, name: checked.name },
  });

  revalidatePath("/", "layout");
  return { message: `Category renamed to "${checked.name}".`, ok: true };
}

export async function deleteCategory(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const access = await authorize("books.manage", "delete a book category");
  if (!access.ok) return { message: access.message };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id < 1) {
    return { message: "Category not found." };
  }

  const [existing] = await sql<{ name: string }[]>`
    select name from categories where id = ${id}
  `;
  if (!existing) return { message: "Category not found." };

  const [usage] = await sql<{ count: number }[]>`
    select count(*)::int as count from books where category_id = ${id}
  `;
  if (usage.count > 0) {
    return {
      message: `"${existing.name}" is used by ${usage.count} ${
        usage.count === 1 ? "book" : "books"
      }. Reassign those books before deleting the category.`,
    };
  }

  await sql`delete from categories where id = ${id}`;

  await logAudit({
    action: "category.deleted",
    entityType: "category",
    entityId: id,
    summary: `${access.user.name} deleted category "${existing.name}"`,
    actor: access.user,
    metadata: { name: existing.name },
  });

  revalidatePath("/", "layout");
  return { message: `Category "${existing.name}" deleted.`, ok: true };
}
