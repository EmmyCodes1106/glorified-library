import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";
import sql from "@/db";

// Digital copies live outside the web root; the only way to a byte is through
// the authenticated member routes, which check for an open loan first.
export const EBOOK_DIR = path.join(process.cwd(), "storage", "ebooks");
export const MAX_EBOOK_BYTES = 50 * 1024 * 1024;

const FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.epub$/;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/png", "image/png"],
  ["image/gif", "image/gif"],
  ["image/webp", "image/webp"],
]);

export type EbookSource = "upload" | "gutenberg";

export type EbookFile = {
  id: number;
  bookId: number;
  fileName: string;
  originalName: string;
  byteSize: number;
  source: EbookSource;
  sourceRef: string | null;
};

type EbookRow = {
  id: number;
  book_id: number;
  file_name: string;
  original_name: string;
  byte_size: number;
  source: string;
  source_ref: string | null;
};

export type EbookFailure = { error: string };

function toFile(row: EbookRow): EbookFile {
  return {
    id: row.id,
    bookId: row.book_id,
    fileName: row.file_name,
    originalName: row.original_name,
    byteSize: Number(row.byte_size),
    source: row.source === "gutenberg" ? "gutenberg" : "upload",
    sourceRef: row.source_ref,
  };
}

export async function getBookEbook(bookId: number): Promise<EbookFile | null> {
  const [row] = await sql<EbookRow[]>`
    select id, book_id, file_name, original_name, byte_size, source, source_ref
    from book_files
    where book_id = ${bookId}
  `;
  return row ? toFile(row) : null;
}

export async function getBookEbooks(
  bookIds: number[]
): Promise<Map<number, EbookFile>> {
  if (bookIds.length === 0) return new Map();
  const rows = await sql<EbookRow[]>`
    select id, book_id, file_name, original_name, byte_size, source, source_ref
    from book_files
    where book_id = any(${bookIds})
  `;
  return new Map(rows.map((row) => [row.book_id, toFile(row)]));
}

export async function saveEbookFile(
  bytes: Buffer
): Promise<{ file: { fileName: string; byteSize: number } } | EbookFailure> {
  if (bytes.byteLength === 0) {
    return { error: "The uploaded file is empty." };
  }
  if (bytes.byteLength > MAX_EBOOK_BYTES) {
    return { error: "EPUB files must be 50 MB or smaller." };
  }
  // Every EPUB is a ZIP archive, so the first bytes must be a local header.
  if (bytes.subarray(0, 2).toString("latin1") !== "PK") {
    return { error: "That file is not a valid EPUB." };
  }

  const fileName = `${randomUUID()}.epub`;
  await mkdir(EBOOK_DIR, { recursive: true });
  await writeFile(path.join(EBOOK_DIR, fileName), bytes);
  return { file: { fileName, byteSize: bytes.byteLength } };
}

export type LinkEbookInput = {
  bookId: number;
  file: { fileName: string; byteSize: number };
  originalName: string;
  uploadedBy: number | null;
  source?: EbookSource;
  sourceRef?: string | null;
  sourceUrl?: string | null;
  rightsBasis?: string | null;
};

/**
 * Points a book at a stored file. Uploads replace any existing copy; the
 * public-domain fetcher passes `replaceExisting: false` and gets null back when
 * another run already attached a file, so its download can be discarded.
 */
export async function linkEbookFile(
  input: LinkEbookInput,
  options: { replaceExisting?: boolean } = {}
): Promise<{ id: number } | null> {
  const replace = options.replaceExisting === true;
  const [row] = await sql<{ id: number }[]>`
    insert into book_files (
      book_id, format, file_name, original_name, byte_size, uploaded_by,
      source, source_ref, source_url, rights_basis
    )
    values (
      ${input.bookId}, 'epub', ${input.file.fileName}, ${input.originalName},
      ${input.file.byteSize}, ${input.uploadedBy ?? null},
      ${input.source ?? "upload"}, ${input.sourceRef ?? null},
      ${input.sourceUrl ?? null}, ${input.rightsBasis ?? null}
    )
    ${
      replace
        ? sql`on conflict (book_id) do update set
            format = excluded.format,
            file_name = excluded.file_name,
            original_name = excluded.original_name,
            byte_size = excluded.byte_size,
            uploaded_by = excluded.uploaded_by,
            source = excluded.source,
            source_ref = excluded.source_ref,
            source_url = excluded.source_url,
            rights_basis = excluded.rights_basis,
            uploaded_at = now()`
        : sql`on conflict (book_id) do nothing`
    }
    returning id
  `;
  return row ? { id: row.id } : null;
}

export async function deleteEbookFile(fileName: string) {
  if (!FILE_NAME_PATTERN.test(fileName)) return;
  try {
    await unlink(path.join(EBOOK_DIR, fileName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function readEbookBytes(file: EbookFile): Promise<Buffer | null> {
  if (!FILE_NAME_PATTERN.test(file.fileName)) return null;
  try {
    return await readFile(path.join(EBOOK_DIR, file.fileName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export type EbookAccess = {
  bookId: number;
  title: string;
  author: string;
  dueOn: string;
  file: EbookFile;
};

/**
 * The single gate for digital reading: an active member holding a copy that
 * has not been returned yet. Anything else gets no access at all.
 */
export async function getEbookAccess(
  memberId: number,
  bookId: number
): Promise<EbookAccess | null> {
  const [row] = await sql<
    {
      book_id: number;
      title: string;
      author: string;
      due_on: string;
      id: number;
      file_name: string;
      original_name: string;
      byte_size: number;
      source: string;
      source_ref: string | null;
    }[]
  >`
    select
      b.id as book_id,
      b.title,
      a.name as author,
      to_char(l.due_on, 'DD Mon YYYY') as due_on,
      f.id,
      f.file_name,
      f.original_name,
      f.byte_size,
      f.source,
      f.source_ref
    from loans l
    join books b on b.id = l.book_id
    join authors a on a.id = b.author_id
    join members m on m.id = l.member_id
    join book_files f on f.book_id = b.id
    where l.member_id = ${memberId}
      and l.book_id = ${bookId}
      and l.returned_on is null
      and m.status = 'active'
      and (m.membership_expires_on is null or m.membership_expires_on >= current_date)
    order by l.due_on
    limit 1
  `;

  if (!row) return null;
  return {
    bookId: row.book_id,
    title: row.title,
    author: row.author,
    dueOn: row.due_on,
    file: toFile(row),
  };
}

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
};

export type EpubStructure = {
  title: string | null;
  /** Zip paths of the spine documents, in reading order. */
  chapters: string[];
  /** Image entries, sorted by path so indexes stay stable across requests. */
  images: { path: string; contentType: string }[];
};

export type EpubOpenResult =
  | { ok: true; zip: JSZip; structure: EpubStructure }
  | { ok: false; error: string };

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeZipPath(value: string) {
  return path.posix.normalize(value).replace(/^\/+/, "");
}

function resolveHref(baseFile: string, href: string): string | null {
  const clean = href.split("#")[0].split("?")[0].trim();
  if (!clean) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("//")) {
    return null;
  }
  const decoded = (() => {
    try {
      return decodeURIComponent(clean);
    } catch {
      return clean;
    }
  })();
  return normalizeZipPath(path.posix.join(path.posix.dirname(baseFile), decoded));
}

/** EPUB hrefs are URI-encoded while zip entries may be stored raw. */
function findZipEntry(zip: JSZip, name: string): JSZip.JSZipObject | null {
  const normalized = normalizeZipPath(name);
  const candidates = [normalized];
  try {
    candidates.push(encodeURI(normalized));
  } catch {
    // an already-encoded or invalid path is left as-is
  }
  for (const candidate of candidates) {
    const entry = zip.file(candidate);
    if (entry) return entry;
  }
  return null;
}

async function readZipText(zip: JSZip, name: string) {
  const entry = findZipEntry(zip, name);
  return entry ? entry.async("string") : null;
}

async function analyzeEpub(zip: JSZip): Promise<EpubStructure | EbookFailure> {
  const containerXml = await readZipText(zip, "META-INF/container.xml");
  if (!containerXml) {
    return { error: "This EPUB has no container file." };
  }

  let container: Record<string, unknown>;
  try {
    container = xml.parse(containerXml);
  } catch {
    return { error: "This EPUB has an unreadable container file." };
  }
  const rootfiles = asArray(
    (container?.container as { rootfiles?: { rootfile?: unknown } } | undefined)
      ?.rootfiles?.rootfile
  ) as { "@_full-path"?: string }[];
  const opfPath = rootfiles
    .map((entry) => entry?.["@_full-path"])
    .find((value): value is string => Boolean(value));
  if (!opfPath) {
    return { error: "This EPUB does not declare a package file." };
  }

  const opfXml = await readZipText(zip, normalizeZipPath(opfPath));
  if (!opfXml) {
    return { error: "The EPUB package file is missing." };
  }

  type PackageInfo = {
    metadata?: { title?: unknown };
    manifest?: { item?: unknown };
    spine?: { itemref?: unknown };
  };
  let opf: PackageInfo | undefined;
  try {
    opf = (xml.parse(opfXml) as { package?: PackageInfo })?.package;
  } catch {
    return { error: "The EPUB package file is unreadable." };
  }
  if (!opf) return { error: "The EPUB package file is unreadable." };

  const manifest: ManifestItem[] = (
    asArray(opf.manifest?.item) as {
      "@_id"?: string;
      "@_href"?: string;
      "@_media-type"?: string;
    }[]
  )
    .map((item) => ({
      id: String(item?.["@_id"] ?? ""),
      href: String(item?.["@_href"] ?? ""),
      mediaType: String(item?.["@_media-type"] ?? "").toLowerCase(),
    }))
    .filter((item) => item.id && item.href);

  const byId = new Map(manifest.map((item) => [item.id, item]));

  const chapters: string[] = [];
  for (const ref of asArray(opf.spine?.itemref) as { "@_idref"?: string }[]) {
    const item = byId.get(String(ref?.["@_idref"] ?? ""));
    if (!item) continue;
    if (
      item.mediaType !== "application/xhtml+xml" &&
      item.mediaType !== "text/html"
    ) {
      continue;
    }
    const resolved = resolveHref(normalizeZipPath(opfPath), item.href);
    const entry = resolved ? findZipEntry(zip, resolved) : null;
    if (entry) chapters.push(entry.name);
  }
  if (chapters.length === 0) {
    return { error: "This EPUB has no readable chapters." };
  }

  const images = manifest
    .map((item) => {
      const contentType = IMAGE_TYPES.get(item.mediaType);
      const resolved = resolveHref(normalizeZipPath(opfPath), item.href);
      const entry = contentType && resolved ? findZipEntry(zip, resolved) : null;
      return entry && contentType
        ? { path: entry.name, contentType }
        : null;
    })
    .filter(
      (item): item is { path: string; contentType: string } => item !== null
    )
    .sort((left, right) => left.path.localeCompare(right.path));

  const titles = asArray(opf.metadata?.title);
  const rawTitle = titles[0];
  const title =
    typeof rawTitle === "string"
      ? rawTitle
      : typeof (rawTitle as { "#text"?: unknown } | undefined)?.["#text"] ===
          "string"
        ? ((rawTitle as { "#text": string })["#text"])
        : null;

  return { title: title?.slice(0, 300) || null, chapters, images };
}

// Parsed structure is small compared with the file itself, so it is cached
// per stored file name (a replace always gets a new name).
const structureCache = new Map<string, EpubStructure>();
const STRUCTURE_CACHE_LIMIT = 20;

async function openEpub(file: EbookFile): Promise<EpubOpenResult> {
  const bytes = await readEbookBytes(file);
  if (!bytes) {
    return { ok: false, error: "The digital copy is missing from storage." };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return { ok: false, error: "The stored EPUB could not be opened." };
  }

  const cached = structureCache.get(file.fileName);
  if (cached) return { ok: true, zip, structure: cached };

  const result = await analyzeEpub(zip);
  if ("error" in result) return { ok: false, error: result.error };

  if (structureCache.size >= STRUCTURE_CACHE_LIMIT) {
    const oldest = structureCache.keys().next().value;
    if (oldest) structureCache.delete(oldest);
  }
  structureCache.set(file.fileName, result);
  return { ok: true, zip, structure: result };
}

const ALLOWED_TAGS = [
  "p", "div", "span", "br", "hr", "em", "i", "strong", "b", "u", "s",
  "sub", "sup", "small", "mark", "abbr", "cite", "q", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "colgroup", "col", "img", "figure", "figcaption", "section", "article",
  "aside", "header", "footer", "pre", "code", "a",
];

const ALLOWED_STYLES = {
  "text-align": [/^(left|right|center|justify)$/],
  "text-indent": [/^\d+(?:\.\d+)?(?:em|rem|px|%)$/],
  "font-style": [/^(normal|italic|oblique)$/],
  "font-weight": [/^(normal|bold|[1-9]00)$/],
  "text-decoration": [/^(none|underline|line-through)$/],
  "vertical-align": [/^(baseline|sub|super|middle)$/],
  "margin-left": [/^\d+(?:\.\d+)?(?:em|rem|px|%)$/],
  "margin-right": [/^\d+(?:\.\d+)?(?:em|rem|px|%)$/],
};

function cleanChapterMarkup(raw: string): string {
  return raw
    .replace(/<\?xml[^>]*\?>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<head\b[\s\S]*?<\/head>/gi, "")
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*>/gi, "");
}

function assetUrl(bookId: number, index: number) {
  return `/api/member/read/${bookId}/asset/${index}`;
}

export type ChapterResult =
  | { ok: true; html: string; chapterCount: number; title: string | null }
  | { ok: false; error: string };

export async function loadChapter(
  bookId: number,
  file: EbookFile,
  index: number
): Promise<ChapterResult> {
  const opened = await openEpub(file);
  if (!opened.ok) return { ok: false, error: opened.error };

  const { zip, structure } = opened;
  const chapterPath = structure.chapters[index];
  if (!chapterPath) return { ok: false, error: "That chapter does not exist." };

  const entry = zip.file(chapterPath);
  if (!entry) return { ok: false, error: "That chapter is missing from the file." };

  const raw = cleanChapterMarkup(await entry.async("string"));
  const chapterDir = path.posix.dirname(chapterPath);
  const imageIndexByPath = new Map(
    structure.images.map((image, position) => [image.path, position])
  );

  const html = sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": ["class", "style"],
      img: ["src", "alt", "width", "height", "loading"],
    },
    allowedStyles: { "*": ALLOWED_STYLES },
    transformTags: {
      img: (_tagName, attribs): sanitizeHtml.Tag => {
        const src = attribs.src ?? "";
        const clean = src.split("#")[0].split("?")[0];
        const decoded = (() => {
          try {
            return decodeURIComponent(clean);
          } catch {
            return clean;
          }
        })();
        const resolved = clean
          ? normalizeZipPath(path.posix.join(chapterDir, decoded))
          : "";
        const position = imageIndexByPath.get(resolved);
        if (position === undefined) {
          return { tagName: "span", attribs: {}, text: "" };
        }
        return {
          tagName: "img",
          attribs: {
            src: assetUrl(bookId, position),
            alt: attribs.alt ?? "",
            loading: "lazy",
          },
        };
      },
    },
  });

  return {
    ok: true,
    html,
    chapterCount: structure.chapters.length,
    title: structure.title,
  };
}

export type AssetResult =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false; error: string };

export async function loadAsset(
  file: EbookFile,
  index: number
): Promise<AssetResult> {
  const opened = await openEpub(file);
  if (!opened.ok) return { ok: false, error: opened.error };

  const asset = opened.structure.images[index];
  if (!asset) return { ok: false, error: "Unknown image." };

  const entry = opened.zip.file(asset.path);
  if (!entry) return { ok: false, error: "Unknown image." };

  const bytes = await entry.async("nodebuffer");
  return { ok: true, bytes, contentType: asset.contentType };
}

export type EbookInspection =
  | { ok: true; title: string | null; chapterCount: number }
  | { ok: false; error: string };

/** Checks a freshly stored file before it is linked to a book. */
export async function inspectEbook(file: EbookFile): Promise<EbookInspection> {
  const opened = await openEpub(file);
  if (!opened.ok) return { ok: false, error: opened.error };
  return {
    ok: true,
    title: opened.structure.title,
    chapterCount: opened.structure.chapters.length,
  };
}

