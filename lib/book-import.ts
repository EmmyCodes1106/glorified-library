import "server-only";

import sql from "@/db";
import { logAudit } from "@/lib/auth/audit";
import type { SessionUser } from "@/lib/auth/session";
import { saveCoverFile } from "./covers";
import { IMPORT_COPIES } from "./import-constants";
import {
  OPEN_LIBRARY_MAX_RESULTS,
  downloadOpenLibraryCover,
  openLibraryCoverUrl,
  searchOpenLibraryPage,
} from "./open-library";

const COVER_WORKERS = 4;

export type ImportMode = "subject" | "query";

export type ImportBatchInput = {
  mode: ImportMode;
  term: string;
  offset: number;
  limit: number;
};

export type ImportBatchResult = {
  scanned: number;
  imported: number;
  duplicates: number;
  incomplete: number;
  failed: number;
  total: number;
  nextOffset: number;
  done: boolean;
};

export function buildImportQuery(mode: ImportMode, term: string) {
  const clean = term.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
  return mode === "subject" ? `subject:"${clean}"` : clean;
}

async function findOrCreateSubjectCategory(name: string) {
  const trimmed = name.slice(0, 80);
  if (!trimmed) return null;

  const [existing] = await sql`
    select id from categories where lower(name) = lower(${trimmed})
  `;
  if (existing) return existing.id as number;

  const [created] = await sql`
    insert into categories (name) values (${trimmed})
    on conflict do nothing
    returning id
  `;
  if (created) return created.id as number;

  const [again] = await sql`
    select id from categories where lower(name) = lower(${trimmed})
  `;
  return (again?.id as number) ?? null;
}

async function resolveAuthors(names: string[]) {
  const ids = new Map<string, number>();
  if (names.length === 0) return ids;

  const unique = new Map<string, string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (!unique.has(key)) unique.set(key, name);
  }

  const rows = await sql<{ id: number; name: string }[]>`
    select id, name from authors where lower(name) = any(${[...unique.keys()]})
  `;
  for (const row of rows) ids.set(row.name.toLowerCase(), row.id);

  const missing = [...unique.entries()].filter(([key]) => !ids.has(key));
  if (missing.length > 0) {
    const inserted = await sql<{ id: number; name: string }[]>`
      insert into authors ${sql(missing.map(([, name]) => ({ name })))}
      on conflict (name) do nothing
      returning id, name
    `;
    for (const row of inserted) ids.set(row.name.toLowerCase(), row.id);

    const unresolved = missing
      .map(([key]) => key)
      .filter((key) => !ids.has(key));
    if (unresolved.length > 0) {
      const again = await sql<{ id: number; name: string }[]>`
        select id, name from authors where lower(name) = any(${unresolved})
      `;
      for (const row of again) ids.set(row.name.toLowerCase(), row.id);
    }
  }

  return ids;
}

async function attachCovers(items: { id: number; coverId: number | null }[]) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(COVER_WORKERS, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        const url = openLibraryCoverUrl(item.coverId, "L");
        if (!url) continue;

        const image = await downloadOpenLibraryCover(url);
        if (!image || "error" in image) continue;

        const saved = await saveCoverFile(image.bytes, image.contentType);
        if ("error" in saved) continue;

        try {
          await sql`update books set cover_path = ${saved.path} where id = ${item.id}`;
        } catch (error) {
          console.error("Cover attach failed for book", item.id, error);
        }
      }
    }
  );
  await Promise.all(workers);
}

export async function runImportBatch(
  input: ImportBatchInput,
  user: SessionUser
): Promise<ImportBatchResult> {
  const page = Math.floor(input.offset / input.limit) + 1;
  const { books, total } = await searchOpenLibraryPage(
    buildImportQuery(input.mode, input.term),
    page,
    input.limit
  );

  const candidates = books.filter((book) => book.author);
  const incomplete = books.length - candidates.length;

  const keys = candidates.map((book) => book.key);
  const isbns = candidates
    .map((book) => book.isbn)
    .filter((isbn): isbn is string => Boolean(isbn));

  const existing = keys.length
    ? isbns.length
      ? await sql<{ open_library_key: string | null; isbn: string | null }[]>`
          select open_library_key, isbn from books
          where open_library_key = any(${keys}) or isbn = any(${isbns})
        `
      : await sql<{ open_library_key: string | null; isbn: string | null }[]>`
          select open_library_key, isbn from books
          where open_library_key = any(${keys})
        `
    : [];

  const seenKeys = new Set(
    existing.map((row) => row.open_library_key).filter(Boolean)
  );
  const seenIsbns = new Set(existing.map((row) => row.isbn).filter(Boolean));

  const fresh = candidates.filter(
    (book) =>
      !seenKeys.has(book.key) && !(book.isbn && seenIsbns.has(book.isbn))
  );
  const duplicates = candidates.length - fresh.length;

  const authorIds = await resolveAuthors(
    fresh.map((book) => (book.author ?? "").slice(0, 200))
  );
  const categoryId =
    input.mode === "subject"
      ? await findOrCreateSubjectCategory(input.term)
      : null;

  let imported = 0;
  let failed = 0;
  const importedRows: { id: number; coverId: number | null }[] = [];

  for (const book of fresh) {
    const authorId = authorIds.get((book.author ?? "").toLowerCase());
    if (!authorId) {
      failed++;
      continue;
    }

    try {
      const [row] = await sql<{ id: number }[]>`
        insert into books (
          title, year, author_id, category_id, isbn, total_copies,
          open_library_key
        )
        values (
          ${book.title}, ${book.year}, ${authorId}, ${categoryId},
          ${book.isbn}, ${IMPORT_COPIES}, ${book.key}
        )
        returning id
      `;
      imported++;
      importedRows.push({ id: row.id, coverId: book.coverId });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        failed++;
      } else {
        console.error("Import failed for", book.key, error);
        failed++;
      }
    }
  }

  await attachCovers(importedRows);

  if (imported > 0) {
    await logAudit({
      action: "book.bulk_imported",
      entityType: "book",
      summary: `${user.name} imported ${imported} book${
        imported === 1 ? "" : "s"
      } from Open Library (${
        input.mode === "subject" ? "subject" : "search"
      }: ${input.term})`,
      actor: user,
      metadata: {
        mode: input.mode,
        term: input.term,
        offset: input.offset,
        imported,
        duplicates,
        incomplete,
        copies: IMPORT_COPIES,
      },
    });
  }

  const nextOffset = input.offset + books.length;
  const done =
    books.length === 0 ||
    nextOffset >= Math.min(total, OPEN_LIBRARY_MAX_RESULTS);

  return {
    scanned: books.length,
    imported,
    duplicates,
    incomplete,
    failed,
    total,
    nextOffset,
    done,
  };
}
