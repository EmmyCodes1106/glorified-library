import "server-only";

import { cache } from "react";
import sql from "@/db";

export const DAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export type DayHours = { open: string; close: string };

export type OpeningHours = Record<DayKey, DayHours | null>;

export type LibraryIdentity = {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  website: string | null;
  logoDataUrl: string | null;
  currencySymbol: string;
  noticeText: string | null;
  openingHours: OpeningHours;
};

export type LendingSettings = {
  defaultLoanDays: number;
  fineEnabled: boolean;
  finePerDay: string;
  fineGraceDays: number;
  defaultMemberLimit: number;
  maxMemberLimit: number;
  membershipMonths: number;
  currencySymbol: string;
};

type SettingsRow = {
  library_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  website: string | null;
  logo_data_url: string | null;
  currency_symbol: string;
  notice_text: string | null;
  opening_hours: unknown;
};

const FALLBACK_IDENTITY: LibraryIdentity = {
  name: "Library",
  contactEmail: null,
  contactPhone: null,
  contactAddress: null,
  website: null,
  logoDataUrl: null,
  currencySymbol: "",
  noticeText: null,
  openingHours: normalizeOpeningHours({}),
};

export function timeIsValid(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeOpeningHours(value: unknown): OpeningHours {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const hours = {} as OpeningHours;

  for (const day of DAY_KEYS) {
    const entry = source[day];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      hours[day] = null;
      continue;
    }
    const open = String((entry as Record<string, unknown>).open ?? "");
    const close = String((entry as Record<string, unknown>).close ?? "");
    hours[day] =
      timeIsValid(open) && timeIsValid(close) && open < close
        ? { open, close }
        : null;
  }

  return hours;
}

export function dayKeyFor(date = new Date()): DayKey {
  return DAY_KEYS[(date.getDay() + 6) % 7];
}

export function hoursForDay(
  hours: OpeningHours,
  date = new Date()
): DayHours | null {
  return hours[dayKeyFor(date)];
}

export function todayHoursLabel(hours: OpeningHours, date = new Date()) {
  const value = hoursForDay(hours, date);
  return value ? `${value.open}–${value.close}` : "Closed";
}

export function formatMoney(
  value: string | number | null | undefined,
  symbol = ""
) {
  const parsed = Number(value ?? 0);
  const amount = Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
  return symbol ? `${symbol}${amount}` : amount;
}

export const getLibraryIdentity = cache(
  async (): Promise<LibraryIdentity> => {
    const [row] = await sql<SettingsRow[]>`
      select
        library_name,
        contact_email,
        contact_phone,
        contact_address,
        website,
        logo_data_url,
        currency_symbol,
        notice_text,
        opening_hours
      from library_settings
      where id
    `;
    if (!row) return FALLBACK_IDENTITY;

    return {
      name: row.library_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      contactAddress: row.contact_address,
      website: row.website,
      logoDataUrl: row.logo_data_url,
      currencySymbol: row.currency_symbol,
      noticeText: row.notice_text,
      openingHours: normalizeOpeningHours(row.opening_hours),
    };
  }
);

type LendingRow = {
  default_loan_days: number;
  fine_enabled: boolean;
  fine_per_day: string;
  fine_grace_days: number;
  default_member_limit: number;
  max_member_limit: number;
  membership_months: number;
  currency_symbol: string;
};

export const getLendingSettings = cache(
  async (): Promise<LendingSettings> => {
    const [row] = await sql<LendingRow[]>`
      select
        c.default_loan_days,
        c.fine_enabled,
        c.fine_per_day::text as fine_per_day,
        c.fine_grace_days,
        l.default_member_limit,
        l.max_member_limit,
        l.membership_months,
        l.currency_symbol
      from circulation_settings c
      join library_settings l on l.id
      where c.id
    `;

    return {
      defaultLoanDays: row?.default_loan_days ?? 14,
      fineEnabled: row?.fine_enabled ?? false,
      finePerDay: row?.fine_per_day ?? "0.00",
      fineGraceDays: row?.fine_grace_days ?? 0,
      defaultMemberLimit: row?.default_member_limit ?? 5,
      maxMemberLimit: row?.max_member_limit ?? 100,
      membershipMonths: row?.membership_months ?? 0,
      currencySymbol: row?.currency_symbol ?? "",
    };
  }
);
