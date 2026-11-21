"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/dal";
import {
  runImportBatch,
  type ImportBatchResult,
  type ImportMode,
} from "@/lib/book-import";
import {
  FETCH_BATCH_LIMIT,
  IMPORT_BATCH_LIMIT,
} from "@/lib/import-constants";
import { OPEN_LIBRARY_MAX_RESULTS } from "@/lib/open-library";
import {
  runPublicDomainBatch,
  type PublicDomainBatchResult,
} from "@/lib/public-domain";

export type ImportActionResult =
  | { ok: true; result: ImportBatchResult }
  | { ok: false; message: string };

export type FetchActionResult =
  | { ok: true; result: PublicDomainBatchResult }
  | { ok: false; message: string };

export async function importOpenLibraryBatchAction(input: {
  mode: string;
  term: string;
  offset: number;
  limit: number;
}): Promise<ImportActionResult> {
  const access = await authorize("books.manage", "bulk import books");
  if (!access.ok) return { ok: false, message: access.message };
  if (access.user.role !== "super_admin") {
    return {
      ok: false,
      message: "Only a super administrator can run a bulk import.",
    };
  }

  const mode: ImportMode | null =
    input.mode === "subject" || input.mode === "query" ? input.mode : null;
  if (!mode) {
    return { ok: false, message: "Choose a subject or a search query." };
  }

  const term = String(input.term ?? "").trim();
  if (term.length < 2 || term.length > 100) {
    return {
      ok: false,
      message: "Enter between 2 and 100 characters to import.",
    };
  }

  const offset = Math.floor(Number(input.offset));
  if (!Number.isInteger(offset) || offset < 0 || offset >= OPEN_LIBRARY_MAX_RESULTS) {
    return { ok: false, message: "That import position is out of range." };
  }

  const limit = Math.min(
    IMPORT_BATCH_LIMIT,
    Math.max(1, Math.floor(Number(input.limit) || IMPORT_BATCH_LIMIT))
  );

  let result: ImportBatchResult;
  try {
    result = await runImportBatch({ mode, term, offset, limit }, access.user);
  } catch (error) {
    console.error("Open Library import failed:", error);
    return {
      ok: false,
      message:
        "Could not reach Open Library for that batch. Your imported books are safe — press Start again to continue.",
    };
  }

  if (result.imported > 0) {
    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/circulation");
  }

  return { ok: true, result };
}

export async function fetchPublicDomainBatchAction(input: {
  cursor: number;
  limit: number;
}): Promise<FetchActionResult> {
  const access = await authorize(
    "books.manage",
    "attach public-domain digital copies"
  );
  if (!access.ok) return { ok: false, message: access.message };
  if (access.user.role !== "super_admin") {
    return {
      ok: false,
      message: "Only a super administrator can attach public-domain copies.",
    };
  }

  const cursor = Math.floor(Number(input.cursor));
  if (!Number.isInteger(cursor) || cursor < 0) {
    return { ok: false, message: "That catalogue position is out of range." };
  }

  const limit = Math.min(
    FETCH_BATCH_LIMIT,
    Math.max(1, Math.floor(Number(input.limit) || FETCH_BATCH_LIMIT))
  );

  let result: PublicDomainBatchResult;
  try {
    result = await runPublicDomainBatch({ cursor, limit }, access.user);
  } catch (error) {
    console.error("Public-domain fetch failed:", error);
    return {
      ok: false,
      message:
        "The fetch stopped unexpectedly. Copies already attached are safe — press Start to continue.",
    };
  }

  if (result.attached > 0) {
    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/circulation");
  }

  return { ok: true, result };
}
