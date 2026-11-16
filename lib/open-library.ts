import { MAX_COVER_BYTES, type CoverError } from "./covers";

export type OpenLibraryBook = {
  key: string;
  title: string;
  author: string | null;
  year: number | null;
  publisher: string | null;
  isbn: string | null;
  coverId: number | null;
};

const API_BASE = "https://openlibrary.org";
const COVER_HOST = "covers.openlibrary.org";
const SEARCH_FIELDS =
  "key,title,author_name,first_publish_year,publisher,cover_i,isbn";
const REQUEST_TIMEOUT_MS = 10_000;

export function openLibraryCoverUrl(
  coverId: number | null,
  size: "S" | "M" | "L"
): string | null {
  return coverId ? `https://${COVER_HOST}/b/id/${coverId}-${size}.jpg` : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickIsbn(doc: Record<string, unknown>): string | null {
  const candidates = asArray(doc.isbn)
    .filter((v): v is string => typeof v === "string")
    .slice(0, 40);
  const isbn13 = candidates.find((v) => /^97[89]\d{10}$/.test(v));
  const isbn10 = candidates.find((v) => /^\d{9}[\dXx]$/.test(v));
  const best = isbn13 ?? isbn10;
  return best ? best.replace(/[^\dXx]/g, "").toUpperCase() : null;
}

function normalizeDoc(doc: Record<string, unknown>): OpenLibraryBook | null {
  const key = typeof doc.key === "string" ? doc.key : "";
  const title = typeof doc.title === "string" ? doc.title.trim() : "";
  if (!/^\/works\/[A-Za-z0-9_-]+$/.test(key) || !title || title.length > 300) {
    return null;
  }

  const authors = asArray(doc.author_name).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  const publishers = asArray(doc.publisher).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  const year = Number(doc.first_publish_year);

  return {
    key,
    title,
    author: authors[0]?.trim() ?? null,
    year: Number.isInteger(year) && year >= 1 && year <= 2100 ? year : null,
    publisher: publishers[0]?.trim().slice(0, 80) ?? null,
    isbn: pickIsbn(doc),
    coverId: Number.isInteger(Number(doc.cover_i))
      ? Number(doc.cover_i)
      : null,
  };
}

export async function searchOpenLibrary(
  query: string
): Promise<OpenLibraryBook[]> {
  const url = `${API_BASE}/search.json?${new URLSearchParams({
    q: query,
    limit: "8",
    fields: SEARCH_FIELDS,
  })}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Open Library responded ${response.status}`);

  const data = (await response.json()) as { docs?: unknown[] };
  return asArray(data.docs)
    .map((doc) =>
      typeof doc === "object" && doc !== null
        ? normalizeDoc(doc as Record<string, unknown>)
        : null
    )
    .filter((book): book is OpenLibraryBook => book !== null);
}

export async function fetchWorkDescription(
  workKey: string
): Promise<string | null> {
  if (!/^\/works\/[A-Za-z0-9_-]+$/.test(workKey)) return null;

  const response = await fetch(`${API_BASE}${workKey}.json`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) return null;

  const data = (await response.json()) as { description?: unknown };
  const raw =
    typeof data.description === "string"
      ? data.description
      : typeof data.description === "object" &&
          data.description !== null &&
          typeof (data.description as { value?: unknown }).value === "string"
        ? (data.description as { value: string }).value
        : null;
  if (!raw) return null;

  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
  return text || null;
}

export async function downloadOpenLibraryCover(
  imageUrl: string
): Promise<{ bytes: Buffer; contentType: string } | CoverError | null> {
  if (!imageUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return { error: "The cover address is not valid." };
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== COVER_HOST ||
    !parsed.pathname.startsWith("/b/id/")
  ) {
    return { error: "Covers can only be downloaded from Open Library." };
  }

  let response: Response;
  try {
    response = await fetch(parsed, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { error: "The cover could not be downloaded from Open Library." };
  }
  if (!response.ok) {
    return { error: "The cover could not be downloaded from Open Library." };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_COVER_BYTES) {
    return { error: "Cover images must be 5 MB or smaller." };
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_COVER_BYTES) {
    return { error: "Cover images must be 5 MB or smaller." };
  }
  if (!bytes.byteLength) {
    return { error: "The cover could not be downloaded from Open Library." };
  }
  return { bytes, contentType };
}
