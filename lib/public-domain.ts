import "server-only";

import sql from "@/db";
import { logAudit } from "@/lib/auth/audit";
import type { SessionUser } from "@/lib/auth/session";
import {
  MAX_EBOOK_BYTES,
  deleteEbookFile,
  inspectEbook,
  linkEbookFile,
  saveEbookFile,
  type EbookFile,
} from "./ebooks";

/**
 * Public-domain copies are matched through Open Library's `id_project_gutenberg`
 * field, so the Gutenberg number comes from the same record the catalogue sheet
 * was imported from. The file itself is fetched from Project Gutenberg's own
 * servers (with its official mirror as fallback).
 */
const OPEN_LIBRARY_BASE = "https://openlibrary.org";
const GUTENBERG_HOSTS = ["www.gutenberg.org", "gutenberg.pglaf.org"];
const LOOKUP_TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_CANDIDATES = 3;
const POLITE_DELAY_MS = 400;
const USER_AGENT = "GlorifiedLibrary/1.0 (catalogue tool; contact the library)";

export type PublicDomainStatus =
  | "attached"
  | "no-match"
  | "unavailable"
  | "invalid"
  | "already"
  | "failed";

export type PublicDomainItem = {
  bookId: number;
  title: string;
  status: PublicDomainStatus;
  gutenbergId?: number;
  chapters?: number;
  detail?: string;
};

export type PublicDomainBatchInput = { cursor: number; limit: number };

export type PublicDomainBatchResult = {
  scanned: number;
  attached: number;
  noMatch: number;
  unavailable: number;
  failed: number;
  /** Books still waiting for a first check. */
  remaining: number;
  /** Books still without any digital copy. */
  withoutCopy: number;
  nextCursor: number | null;
  done: boolean;
  items: PublicDomainItem[];
};
type CatalogBook = {
  id: number;
  title: string;
  author: string;
  open_library_key: string | null;
};

const STOPWORDS = new Set(["the", "a", "an", "of", "and"]);

function titleTokens(value: string): string[] {
  return value
    // catalogue titles often carry "(Penguin Classics)" or ": a novel"
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .split(":")[0]
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 0 && !STOPWORDS.has(word));
}

/** True when the candidate title covers most of the catalogue title's words. */
function titleCovers(bookTitle: string, candidateTitle: string): boolean {
  const wanted = titleTokens(bookTitle);
  if (wanted.length === 0) return false;
  const have = new Set(titleTokens(candidateTitle));
  const hits = wanted.filter((word) => have.has(word)).length;
  return hits / wanted.length >= 0.75;
}

function authorMatches(bookAuthor: string, candidates: string[]): boolean {
  const surname = titleTokens(bookAuthor).at(-1);
  if (!surname) return true;
  return candidates.some((name) => titleTokens(name).includes(surname));
}

function parseGutenbergIds(value: unknown): number[] {
  const list = Array.isArray(value) ? value : [];
  const ids = list
    .map((entry) => Number(entry))
    .filter((id) => Number.isInteger(id) && id > 0 && id < 1_000_000);
  return [...new Set(ids)].sort((left, right) => left - right);
}

type SearchDoc = {
  key?: unknown;
  title?: unknown;
  author_name?: unknown;
  id_project_gutenberg?: unknown;
};

async function searchOpenLibrary(
  query: string,
  fields: string,
  limit: number
): Promise<SearchDoc[]> {
  const params = new URLSearchParams({ q: query, fields, limit: String(limit) });
  const response = await fetch(`${OPEN_LIBRARY_BASE}/search.json?${params}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Open Library responded ${response.status}`);
  }
  const data = (await response.json()) as { docs?: unknown };
  return Array.isArray(data.docs)
    ? (data.docs as SearchDoc[]).filter(
        (doc) => typeof doc === "object" && doc !== null
      )
    : [];
}

async function gutenbergIdsForBook(book: CatalogBook): Promise<number[]> {
  if (book.open_library_key) {
    const docs = await searchOpenLibrary(
      `key:${book.open_library_key}`,
      "key,id_project_gutenberg",
      1
    );
    const ids = parseGutenbergIds(docs[0]?.id_project_gutenberg);
    if (ids.length > 0) return ids;
  }

  const query = [book.title, book.author]
    .join(" ")
    .replace(/["\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  const docs = await searchOpenLibrary(
    query,
    "key,title,author_name,id_project_gutenberg",
    5
  );

  const ids = new Set<number>();
  for (const doc of docs) {
    const docTitle = typeof doc.title === "string" ? doc.title : "";
    if (!docTitle || !titleCovers(book.title, docTitle)) continue;
    const authors = Array.isArray(doc.author_name)
      ? doc.author_name.filter(
          (name): name is string => typeof name === "string"
        )
      : [];
    if (authors.length > 0 && !authorMatches(book.author, authors)) continue;
    for (const id of parseGutenbergIds(doc.id_project_gutenberg)) ids.add(id);
  }
  return [...ids].sort((left, right) => left - right);
}

type Download =
  | { ok: true; bytes: Buffer; url: string }
  | { ok: false; unreachable: boolean; error: string };

async function downloadGutenbergEpub(id: number): Promise<Download> {
  const path = `/cache/epub/${id}/pg${id}.epub`;
  const problems: string[] = [];
  let reachable = false;

  for (const host of GUTENBERG_HOSTS) {
    const url = `https://${host}${path}`;
    try {
      const response = await fetch(url, {
        headers: { accept: "application/epub+zip", "user-agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      reachable = true;

      if (!response.ok) {
        problems.push(`${host} answered ${response.status}`);
        continue;
      }
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > MAX_EBOOK_BYTES) {
        return {
          ok: false,
          unreachable: false,
          error: "That edition is larger than 50 MB.",
        };
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > MAX_EBOOK_BYTES) {
        return {
          ok: false,
          unreachable: false,
          error: "That edition is larger than 50 MB.",
        };
      }
      // a maintenance page or error document is not an EPUB
      if (bytes.subarray(0, 2).toString("latin1") !== "PK") {
        problems.push(`${host} did not return an EPUB`);
        continue;
      }
      return { ok: true, bytes, url };
    } catch {
      problems.push(`${host} could not be reached`);
    }
  }

  return {
    ok: false,
    unreachable: !reachable,
    error: `Project Gutenberg did not deliver the file (${problems.join("; ")}).`,
  };
}

async function tryGutenbergCopy(
  book: CatalogBook,
  id: number,
  user: SessionUser
): Promise<PublicDomainItem> {
  const download = await downloadGutenbergEpub(id);
  if (!download.ok) {
    return {
      bookId: book.id,
      title: book.title,
      status: download.unreachable ? "unavailable" : "failed",
      gutenbergId: id,
      detail: download.error,
    };
  }

  const stored = await saveEbookFile(download.bytes);
  if ("error" in stored) {
    return {
      bookId: book.id,
      title: book.title,
      status: "failed",
      gutenbergId: id,
      detail: stored.error,
    };
  }

  const originalName = `Project Gutenberg #${id}.epub`;
  const file: EbookFile = {
    id: 0,
    bookId: book.id,
    fileName: stored.file.fileName,
    originalName,
    byteSize: stored.file.byteSize,
    source: "gutenberg",
    sourceRef: String(id),
  };

  const inspection = await inspectEbook(file);
  if (!inspection.ok) {
    await deleteEbookFile(stored.file.fileName);
    return {
      bookId: book.id,
      title: book.title,
      status: "invalid",
      gutenbergId: id,
      detail: inspection.error,
    };
  }
  if (inspection.title && !titleCovers(book.title, inspection.title)) {
    await deleteEbookFile(stored.file.fileName);
    return {
      bookId: book.id,
      title: book.title,
      status: "invalid",
      gutenbergId: id,
      detail: `Gutenberg #${id} is "${inspection.title}".`,
    };
  }

  const linked = await linkEbookFile(
    {
      bookId: book.id,
      file: stored.file,
      originalName,
      uploadedBy: user.id,
      source: "gutenberg",
      sourceRef: String(id),
      sourceUrl: download.url,
      rightsBasis: "public_domain",
    },
    { replaceExisting: false }
  );
  if (!linked) {
    // another run attached a copy while this download was in flight
    await deleteEbookFile(stored.file.fileName);
    return {
      bookId: book.id,
      title: book.title,
      status: "already",
      gutenbergId: id,
    };
  }

  return {
    bookId: book.id,
    title: book.title,
    status: "attached",
    gutenbergId: id,
    chapters: inspection.chapterCount,
  };
}

async function processBook(
  book: CatalogBook,
  user: SessionUser
): Promise<PublicDomainItem> {
  let ids: number[];
  try {
    ids = await gutenbergIdsForBook(book);
  } catch (error) {
    console.error("Gutenberg lookup failed for book", book.id, error);
    return {
      bookId: book.id,
      title: book.title,
      status: "failed",
      detail: "Open Library could not be reached for this title.",
    };
  }

  if (ids.length === 0) {
    return {
      bookId: book.id,
      title: book.title,
      status: "no-match",
      detail: "No public-domain edition is linked to this title.",
    };
  }

  let last: PublicDomainItem | null = null;
  for (const id of ids.slice(0, MAX_CANDIDATES)) {
    const result = await tryGutenbergCopy(book, id, user);
    if (result.status === "attached" || result.status === "already") {
      return result;
    }
    last = result;
    // a broken edition is worth retrying with the next number; an offline
    // server is not
    if (result.status === "unavailable") return result;
  }
  return (
    last ?? {
      bookId: book.id,
      title: book.title,
      status: "no-match",
      detail: "No usable public-domain edition was found.",
    }
  );
}

async function countBooksWithoutCopy(): Promise<number> {
  const [row] = await sql<{ total: number }[]>`
    select count(*)::int as total
    from books b
    where not exists (select 1 from book_files f where f.book_id = b.id)
  `;
  return row?.total ?? 0;
}

/**
 * Books a run still has to look at: no copy attached, and not already ruled
 * out. "unavailable" and "failed" checks are retried on the next run.
 */
async function countBooksToCheck(): Promise<number> {
  const [row] = await sql<{ total: number }[]>`
    select count(*)::int as total
    from books b
    where not exists (select 1 from book_files f where f.book_id = b.id)
      and not exists (
        select 1 from public_domain_checks c
        where c.book_id = b.id and c.status in ('no-match', 'invalid')
      )
  `;
  return row?.total ?? 0;
}

export { countBooksToCheck, countBooksWithoutCopy };

async function recordCheck(
  item: PublicDomainItem,
  user: SessionUser
): Promise<void> {
  await sql`
    insert into public_domain_checks (
      book_id, status, gutenberg_id, detail, checked_by
    )
    values (
      ${item.bookId}, ${item.status}, ${item.gutenbergId ?? null},
      ${item.detail ?? null}, ${user.id}
    )
    on conflict (book_id) do update set
      status = excluded.status,
      gutenberg_id = excluded.gutenberg_id,
      detail = excluded.detail,
      checked_by = excluded.checked_by,
      checked_at = now()
  `;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runPublicDomainBatch(
  input: PublicDomainBatchInput,
  user: SessionUser
): Promise<PublicDomainBatchResult> {
  const books = await sql<CatalogBook[]>`
    select b.id, b.title, a.name as author, b.open_library_key
    from books b
    join authors a on a.id = b.author_id
    where b.id > ${input.cursor}
      and not exists (select 1 from book_files f where f.book_id = b.id)
      and not exists (
        select 1 from public_domain_checks c
        where c.book_id = b.id and c.status in ('no-match', 'invalid')
      )
    order by b.id
    limit ${input.limit}
  `;

  const items: PublicDomainItem[] = [];
  for (const book of books) {
    if (items.length > 0) await delay(POLITE_DELAY_MS);
    const item = await processBook(book, user);
    items.push(item);
    try {
      await recordCheck(item, user);
    } catch (error) {
      console.error("Could not record public-domain check", book.id, error);
    }
  }

  const attached = items.filter((item) => item.status === "attached");
  const noMatch = items.filter((item) => item.status === "no-match").length;
  const unavailable = items.filter(
    (item) => item.status === "unavailable"
  ).length;
  const failed = items.filter(
    (item) => item.status === "failed" || item.status === "invalid"
  ).length;

  if (attached.length > 0) {
    await logAudit({
      action: "book.public_domain_attached",
      entityType: "book",
      summary: `${user.name} attached ${attached.length} public-domain digital cop${
        attached.length === 1 ? "y" : "ies"
      } from Project Gutenberg`,
      actor: user,
      metadata: {
        provider: "gutenberg",
        rightsBasis: "public_domain",
        scanned: books.length,
        attached: attached.length,
        books: attached.map((item) => ({
          bookId: item.bookId,
          gutenbergId: item.gutenbergId,
        })),
      },
    });
  }

  return {
    scanned: books.length,
    attached: attached.length,
    noMatch,
    unavailable,
    failed,
    remaining: await countBooksToCheck(),
    withoutCopy: await countBooksWithoutCopy(),
    nextCursor: books.at(-1)?.id ?? null,
    done: books.length < input.limit,
    items,
  };
}
