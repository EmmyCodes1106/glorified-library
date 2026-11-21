import { revalidatePath } from "next/cache";
import sql from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/auth/audit";
import {
  MAX_EBOOK_BYTES,
  deleteEbookFile,
  getBookEbook,
  inspectEbook,
  linkEbookFile,
  saveEbookFile,
  type EbookFile,
} from "@/lib/ebooks";

type Params = { params: Promise<{ bookId: string }> };

function noStoreHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
  };
}

async function resolveBookId(params: Params["params"]) {
  const { bookId } = await params;
  const value = Number(bookId);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Blocks cross-site form posts; the session cookie is already SameSite=Lax. */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Sign in required." },
      { status: 401, headers: noStoreHeaders() }
    );
  }
  if (!hasPermission(user, "books.manage")) {
    return Response.json(
      { error: "You do not have permission to manage digital copies." },
      { status: 403, headers: noStoreHeaders() }
    );
  }
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Request blocked." },
      { status: 403, headers: noStoreHeaders() }
    );
  }

  const bookId = await resolveBookId(params);
  if (!bookId) {
    return Response.json(
      { error: "Book not found." },
      { status: 404, headers: noStoreHeaders() }
    );
  }

  const [book] = await sql<{ id: number; title: string }[]>`
    select id, title from books where id = ${bookId}
  `;
  if (!book) {
    return Response.json(
      { error: "Book not found." },
      { status: 404, headers: noStoreHeaders() }
    );
  }

  const form = await request.formData().catch(() => null);
  const upload = form?.get("file");
  if (!(upload instanceof File) || upload.size === 0) {
    return Response.json(
      { error: "Choose an EPUB file to upload." },
      { status: 400, headers: noStoreHeaders() }
    );
  }
  if (upload.size > MAX_EBOOK_BYTES) {
    return Response.json(
      { error: "EPUB files must be 50 MB or smaller." },
      { status: 400, headers: noStoreHeaders() }
    );
  }
  if (!upload.name.toLowerCase().endsWith(".epub")) {
    return Response.json(
      { error: "Only .epub files can be uploaded." },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  const bytes = Buffer.from(await upload.arrayBuffer());
  const saved = await saveEbookFile(bytes);
  if ("error" in saved) {
    return Response.json(
      { error: saved.error },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  const candidate: EbookFile = {
    id: 0,
    bookId,
    fileName: saved.file.fileName,
    originalName: upload.name.slice(0, 200),
    byteSize: saved.file.byteSize,
    source: "upload",
    sourceRef: null,
  };

  const inspection = await inspectEbook(candidate);
  if (!inspection.ok) {
    await deleteEbookFile(saved.file.fileName);
    return Response.json(
      { error: inspection.error },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  const previous = await getBookEbook(bookId);
  const stored = await linkEbookFile(
    {
      bookId,
      file: saved.file,
      originalName: candidate.originalName,
      uploadedBy: user.id,
      source: "upload",
    },
    { replaceExisting: true }
  );

  // only unlink after the row points at the new file
  if (previous && previous.fileName !== saved.file.fileName) {
    await deleteEbookFile(previous.fileName);
  }

  await logAudit({
    action: "book.ebook_uploaded",
    entityType: "book",
    entityId: bookId,
    summary: `${user.name} uploaded a digital copy of "${book.title}"`,
    actor: user,
    metadata: {
      fileId: stored?.id ?? null,
      fileName: saved.file.fileName,
      byteSize: saved.file.byteSize,
      chapterCount: inspection.chapterCount,
      replaced: Boolean(previous),
    },
  });

  revalidatePath("/");
  revalidatePath("/dashboard");

  return Response.json(
    {
      ok: true,
      ebook: {
        id: stored?.id ?? null,
        originalName: candidate.originalName,
        byteSize: saved.file.byteSize,
        chapterCount: inspection.chapterCount,
      },
    },
    { headers: noStoreHeaders() }
  );
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Sign in required." },
      { status: 401, headers: noStoreHeaders() }
    );
  }
  if (!hasPermission(user, "books.manage")) {
    return Response.json(
      { error: "You do not have permission to manage digital copies." },
      { status: 403, headers: noStoreHeaders() }
    );
  }
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Request blocked." },
      { status: 403, headers: noStoreHeaders() }
    );
  }

  const bookId = await resolveBookId(params);
  if (!bookId) {
    return Response.json(
      { error: "Book not found." },
      { status: 404, headers: noStoreHeaders() }
    );
  }

  const [removed] = await sql<{ id: number; file_name: string; title: string }[]>`
    delete from book_files using books
    where book_files.book_id = ${bookId}
      and books.id = book_files.book_id
    returning book_files.id, book_files.file_name, books.title
  `;
  if (!removed) {
    return Response.json(
      { error: "This book has no digital copy." },
      { status: 404, headers: noStoreHeaders() }
    );
  }

  await deleteEbookFile(removed.file_name);

  await logAudit({
    action: "book.ebook_removed",
    entityType: "book",
    entityId: bookId,
    summary: `${user.name} removed the digital copy of "${removed.title}"`,
    actor: user,
    metadata: { fileId: removed.id, fileName: removed.file_name },
  });

  revalidatePath("/");
  revalidatePath("/dashboard");

  return Response.json({ ok: true }, { headers: noStoreHeaders() });
}
