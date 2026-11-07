"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sql from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logAudit } from "@/lib/auth/audit";
import { getLendingSettings } from "@/lib/settings";
import {
  describeRun,
  notifyBorrowingConfirmation,
  notifyReturnConfirmation,
  notifySuspension,
  runNotificationCycle,
} from "@/lib/notifications";

export type FormState = { message: string; ok?: boolean };

async function sendInBackground(task: () => Promise<void>) {
  try {
    await task();
  } catch (error) {
    console.error("Notification delivery failed:", error);
  }
}

const COVER_DIR = path.join(process.cwd(), "public", "uploads", "covers");
const COVER_URL_PREFIX = "/uploads/covers/";
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

type CheckedBook = {
  title: string;
  author: string;
  year: number;
  copies: number;
  isbn: string | null;
  category: string;
  genres: string[];
  description: string | null;
  shelf: string | null;
  rack: string | null;
};

// checks what the user typed; returns an error message or clean values
function checkBook(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim();
  const yearText = String(formData.get("year") ?? "").trim();
  const copiesText = String(formData.get("totalCopies") ?? "1").trim();
  const isbnText = String(formData.get("isbn") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const genresText = String(formData.get("genres") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const shelf = String(formData.get("shelf") ?? "").trim();
  const rack = String(formData.get("rack") ?? "").trim();

  if (!title) return { ok: false as const, error: "Please enter a title." };
  if (!author) return { ok: false as const, error: "Please enter an author." };
  if (title.length > 300) {
    return { ok: false as const, error: "Titles must be 300 characters or fewer." };
  }

  const year = Number(yearText);
  const thisYear = new Date().getFullYear();
  if (!/^\d{1,4}$/.test(yearText) || year < 1 || year > thisYear) {
    return {
      ok: false as const,
      error: `Please enter a real year (1 to ${thisYear}).`,
    };
  }

  if (!/^\d{1,4}$/.test(copiesText) || Number(copiesText) < 1) {
    return {
      ok: false as const,
      error: "Total copies must be a whole number of at least 1.",
    };
  }
  const copies = Number(copiesText);
  if (copies > 1000) {
    return { ok: false as const, error: "Total copies cannot exceed 1000." };
  }

  let isbn: string | null = null;
  if (isbnText) {
    isbn = isbnText.replace(/[\s-]/g, "").toUpperCase();
    if (!/^(?:\d{9}[\dX]|\d{13})$/.test(isbn)) {
      return {
        ok: false as const,
        error: "ISBN must be 10 or 13 digits (ISBN-10 may end in X).",
      };
    }
  }

  if (category.length > 80) {
    return { ok: false as const, error: "Category must be 80 characters or fewer." };
  }
  if (description.length > 5000) {
    return {
      ok: false as const,
      error: "Description must be 5000 characters or fewer.",
    };
  }
  if (shelf.length > 80 || rack.length > 80) {
    return {
      ok: false as const,
      error: "Shelf and rack must be 80 characters or fewer.",
    };
  }

  const genres = [
    ...new Set(
      genresText
        .split(",")
        .map((genre) => genre.trim())
        .filter(Boolean)
        .map((genre) => genre.slice(0, 60))
    ),
  ];
  if (genres.length > 12) {
    return { ok: false as const, error: "Please use at most 12 genres." };
  }

  const checked: CheckedBook = {
    title,
    author,
    year,
    copies,
    isbn,
    category,
    genres,
    description: description || null,
    shelf: shelf || null,
    rack: rack || null,
  };
  return { ok: true as const, ...checked };
}

async function findOrCreateAuthor(name: string) {
  const [existing] = await sql`
    select id from authors where lower(name) = lower(${name})
  `;
  if (existing) return existing.id as number;

  const [created] = await sql`
    insert into authors (name) values (${name}) returning id
  `;
  return created.id as number;
}

async function findOrCreateCategory(name: string) {
  if (!name) return null;

  const [existing] = await sql`
    select id from categories where lower(name) = lower(${name})
  `;
  if (existing) return existing.id as number;

  const [created] = await sql`
    insert into categories (name) values (${name})
    on conflict do nothing
    returning id
  `;
  if (created) return created.id as number;

  const [again] = await sql`
    select id from categories where lower(name) = lower(${name})
  `;
  return (again?.id as number) ?? null;
}

async function findOrCreateGenres(names: string[]) {
  const ids: number[] = [];
  for (const name of names) {
    const [existing] = await sql`
      select id from genres where lower(name) = lower(${name})
    `;
    if (existing) {
      ids.push(existing.id as number);
      continue;
    }

    const [created] = await sql`
      insert into genres (name) values (${name})
      on conflict do nothing
      returning id
    `;
    if (created) {
      ids.push(created.id as number);
      continue;
    }

    const [again] = await sql`
      select id from genres where lower(name) = lower(${name})
    `;
    if (again) ids.push(again.id as number);
  }
  return ids;
}

async function findIsbnOwner(isbn: string, excludeId?: number) {
  const [owner] = await sql`
    select id, title, book_code
    from books
    where isbn = ${isbn} and id <> ${excludeId ?? 0}
  `;
  return owner;
}

type CoverResult = { error: string } | { path: string } | null;

async function readCover(formData: FormData): Promise<CoverResult> {
  const value = formData.get("cover");
  if (!(value instanceof File) || value.size === 0) return null;

  if (value.size > MAX_COVER_BYTES) {
    return { error: "Cover images must be 5 MB or smaller." } as const;
  }

  const extension = COVER_TYPES.get(value.type);
  if (!extension) {
    return {
      error: "Cover images must be JPG, PNG, WebP or GIF.",
    } as const;
  }

  await mkdir(COVER_DIR, { recursive: true });
  const fileName = `${randomUUID()}.${extension}`;
  await writeFile(
    path.join(COVER_DIR, fileName),
    Buffer.from(await value.arrayBuffer())
  );
  return { path: `${COVER_URL_PREFIX}${fileName}` } as const;
}

async function deleteCover(coverPath: string | null | undefined) {
  if (!coverPath?.startsWith(COVER_URL_PREFIX)) return;

  const fileName = path.basename(coverPath);
  try {
    await unlink(path.join(COVER_DIR, fileName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function syncGenres(bookId: number, genreIds: number[]) {
  await sql`delete from book_genres where book_id = ${bookId}`;
  for (const genreId of genreIds) {
    await sql`
      insert into book_genres (book_id, genre_id)
      values (${bookId}, ${genreId})
      on conflict do nothing
    `;
  }
}

export async function addBook(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("books.manage", "add a book");
  if (!access.ok) return { message: access.message };

  const checked = checkBook(formData);
  if (!checked.ok) return { message: checked.error };

  if (checked.isbn) {
    const owner = await findIsbnOwner(checked.isbn);
    if (owner) {
      return {
        message: `That ISBN already belongs to "${owner.title}" (${owner.book_code}). Use Edit to add copies.`,
      };
    }
  }

  const cover = await readCover(formData);
  if (cover && "error" in cover) return { message: cover.error };

  const authorId = await findOrCreateAuthor(checked.author);
  const categoryId = await findOrCreateCategory(checked.category);
  const genreIds = await findOrCreateGenres(checked.genres);

  try {
    const [created] = await sql`
      insert into books (
        title, year, author_id, category_id, description, cover_path,
        isbn, total_copies, shelf, rack
      )
      values (
        ${checked.title}, ${checked.year}, ${authorId}, ${categoryId},
        ${checked.description}, ${cover?.path ?? null}, ${checked.isbn},
        ${checked.copies}, ${checked.shelf}, ${checked.rack}
      )
      returning id, book_code
    `;

    await syncGenres(created.id as number, genreIds);
    await logAudit({
      action: "book.created",
      entityType: "book",
      entityId: created.id as number,
      summary: `${access.user.name} added "${checked.title}" (${created.book_code})`,
      actor: access.user,
      metadata: { copies: checked.copies, isbn: checked.isbn },
    });
    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/circulation");
    return { message: `Book added as ${created.book_code}.`, ok: true };
  } catch (error) {
    if (cover && "path" in cover) await deleteCover(cover.path);
    if ((error as { code?: string }).code === "23505") {
      return { message: "That ISBN is already registered." };
    }
    throw error;
  }
}

export async function updateBook(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("books.manage", "edit a book");
  if (!access.ok) return { message: access.message };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { message: "Book not found." };

  const checked = checkBook(formData);
  if (!checked.ok) return { message: checked.error };

  if (checked.isbn) {
    const owner = await findIsbnOwner(checked.isbn, id);
    if (owner) {
      return {
        message: `That ISBN already belongs to "${owner.title}" (${owner.book_code}).`,
      };
    }
  }

  const [existing] = await sql`
    select cover_path from books where id = ${id}
  `;
  if (!existing) return { message: "Book not found." };

  const [loanCount] = await sql`
    select count(*)::int as count
    from loans
    where book_id = ${id} and returned_on is null
  `;
  if (checked.copies < loanCount.count) {
    return {
      message: `${loanCount.count} ${
        loanCount.count === 1 ? "copy is" : "copies are"
      } on loan. Total copies cannot be lower than that.`,
    };
  }

  const removeCover = formData.get("removeCover") === "on";
  const cover = await readCover(formData);
  if (cover && "error" in cover) return { message: cover.error };

  const nextCover = cover?.path ?? (removeCover ? null : existing.cover_path);

  const authorId = await findOrCreateAuthor(checked.author);
  const categoryId = await findOrCreateCategory(checked.category);
  const genreIds = await findOrCreateGenres(checked.genres);

  try {
    await sql.begin(async (tx) => {
      await tx`
        update books set
          title = ${checked.title},
          year = ${checked.year},
          author_id = ${authorId},
          category_id = ${categoryId},
          description = ${checked.description},
          cover_path = ${nextCover},
          isbn = ${checked.isbn},
          total_copies = ${checked.copies},
          shelf = ${checked.shelf},
          rack = ${checked.rack}
        where id = ${id}
      `;
      await tx`delete from book_genres where book_id = ${id}`;
      for (const genreId of genreIds) {
        await tx`
          insert into book_genres (book_id, genre_id)
          values (${id}, ${genreId})
          on conflict do nothing
        `;
      }
    });

    if (existing.cover_path && existing.cover_path !== nextCover) {
      await deleteCover(existing.cover_path);
    }

    await logAudit({
      action: "book.updated",
      entityType: "book",
      entityId: id,
      summary: `${access.user.name} updated "${checked.title}"`,
      actor: access.user,
      metadata: { copies: checked.copies, isbn: checked.isbn },
    });

    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/circulation");
    revalidatePath("/fines");
    return { message: "Book updated.", ok: true };
  } catch (error) {
    if (cover && "path" in cover) await deleteCover(cover.path);
    if ((error as { code?: string }).code === "23505") {
      return { message: "That ISBN is already registered." };
    }
    throw error;
  }
}

export async function deleteBook(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("books.manage", "delete a book");
  if (!access.ok) return { message: access.message };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { message: "Book not found." };

  // a book with copies out on loan can't be deleted
  const [onLoan] = await sql`
    select id from loans where book_id = ${id} and returned_on is null limit 1
  `;
  if (onLoan) {
    return {
      message:
        "This book still has copies on loan. Record their returns first.",
    };
  }

  const [deleted] = await sql`
    delete from books where id = ${id}
    returning id, title, cover_path
  `;
  if (!deleted) return { message: "Book not found." };

  await deleteCover(deleted.cover_path);

  await logAudit({
    action: "book.deleted",
    entityType: "book",
    entityId: deleted.id as number,
    summary: `${access.user.name} deleted "${deleted.title}"`,
    actor: access.user,
  });

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/circulation");
  revalidatePath("/fines");
  return { message: "Book deleted.", ok: true };
}

const MEMBER_STATUSES = ["active", "suspended", "expired"] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

type CheckedMember = {
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  status: MemberStatus;
  loanLimit: number;
};

function checkMember(
  formData: FormData,
  limits: { defaultLimit?: number; maxLimit?: number } = {}
) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const statusText = String(formData.get("status") ?? "active").trim();
  const status = MEMBER_STATUSES.find((value) => value === statusText);
  const loanLimitText =
    String(formData.get("loanLimit") ?? "").trim() ||
    (limits.defaultLimit !== undefined ? String(limits.defaultLimit) : "");
  const maxLimit = limits.maxLimit ?? 100;

  if (!name) {
    return { ok: false as const, error: "Please enter the member's full name." };
  }
  if (name.length > 160) {
    return { ok: false as const, error: "Names must be 160 characters or fewer." };
  }
  if (!email) {
    return { ok: false as const, error: "Please enter an email address." };
  }
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return { ok: false as const, error: "Please enter a valid email address." };
  }
  if (phone && !/^[0-9+\-()\s]{6,20}$/.test(phone)) {
    return { ok: false as const, error: "Please enter a valid phone number, or leave it empty." };
  }
  if (address.length > 500) {
    return { ok: false as const, error: "Addresses must be 500 characters or fewer." };
  }
  if (!status) {
    return { ok: false as const, error: "Please choose a valid membership status." };
  }

  if (!/^\d{1,3}$/.test(loanLimitText)) {
    return {
      ok: false as const,
      error: `Borrowing limit must be a whole number between 0 and ${maxLimit}.`,
    };
  }
  const loanLimit = Number(loanLimitText);
  if (loanLimit > maxLimit) {
    return {
      ok: false as const,
      error: `Borrowing limit cannot be higher than the maximum of ${maxLimit} set in System settings.`,
    };
  }

  const checked: CheckedMember = {
    name,
    email,
    phone: phone || null,
    address: address || null,
    status,
    loanLimit,
  };
  return { ok: true as const, ...checked };
}

function isDuplicateEmail(error: unknown) {
  return (error as { code?: string }).code === "23505";
}

export async function addMember(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("members.manage", "register a member");
  if (!access.ok) return { message: access.message };

  const lending = await getLendingSettings();
  const checked = checkMember(formData, {
    defaultLimit: lending.defaultMemberLimit,
    maxLimit: lending.maxMemberLimit,
  });
  if (!checked.ok) return { message: checked.error };

  const [owner] = await sql`
    select name from members where lower(email) = lower(${checked.email})
  `;
  if (owner) {
    return {
      message: `That email address is already registered to ${owner.name}.`,
    };
  }

  try {
    const [created] = await sql`
      insert into members (
        name, email, phone, address, loan_limit, membership_expires_on
      )
      values (
        ${checked.name}, ${checked.email}, ${checked.phone}, ${checked.address},
        ${checked.loanLimit},
        case
          when ${lending.membershipMonths} > 0
          then (current_date + make_interval(months => ${lending.membershipMonths}))::date
          else null
        end
      )
      returning member_code
    `;

    await logAudit({
      action: "member.created",
      entityType: "member",
      entityId: created.member_code as string,
      summary: `${access.user.name} registered ${checked.name} (${created.member_code})`,
      actor: access.user,
    });

    revalidatePath("/members");
    revalidatePath("/dashboard");
    revalidatePath("/circulation");
    return { message: `Member registered as ${created.member_code}.`, ok: true };
  } catch (error) {
    if (isDuplicateEmail(error)) {
      return { message: "That email address is already registered." };
    }
    throw error;
  }
}

export async function updateMember(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("members.manage", "edit a member");
  if (!access.ok) return { message: access.message };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id < 1) return { message: "Member not found." };

  const lending = await getLendingSettings();
  const checked = checkMember(formData, { maxLimit: lending.maxMemberLimit });
  if (!checked.ok) return { message: checked.error };

  const [owner] = await sql`
    select name
    from members
    where lower(email) = lower(${checked.email}) and id <> ${id}
  `;
  if (owner) {
    return {
      message: `That email address is already registered to ${owner.name}.`,
    };
  }

  try {
    const [updated] = await sql`
      update members set
        name = ${checked.name},
        email = ${checked.email},
        phone = ${checked.phone},
        address = ${checked.address},
        status = ${checked.status},
        loan_limit = ${checked.loanLimit}
      where id = ${id}
      returning id
    `;
    if (!updated) return { message: "Member not found." };
  } catch (error) {
    if (isDuplicateEmail(error)) {
      return { message: "That email address is already registered." };
    }
    throw error;
  }

  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/circulation");
  revalidatePath("/fines");

  await logAudit({
    action: "member.updated",
    entityType: "member",
    entityId: id,
    summary: `${access.user.name} updated member ${checked.name}`,
    actor: access.user,
    metadata: { status: checked.status, loanLimit: checked.loanLimit },
  });

  return { message: "Member updated.", ok: true };
}

export async function setMemberStatus(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("members.manage", "change a membership status");
  if (!access.ok) return { message: access.message };

  const id = Number(formData.get("id"));
  const statusText = String(formData.get("status") ?? "").trim();
  const status = MEMBER_STATUSES.find((value) => value === statusText);

  if (!Number.isInteger(id) || id < 1) return { message: "Member not found." };
  if (!status) return { message: "Please choose a valid membership status." };

  const [previous] = await sql`
    select name, status from members where id = ${id}
  `;
  if (!previous) return { message: "Member not found." };

  const [updated] = await sql`
    update members set status = ${status} where id = ${id} returning id
  `;
  if (!updated) return { message: "Member not found." };

  await logAudit({
    action: "member.status_changed",
    entityType: "member",
    entityId: id,
    summary: `${access.user.name} changed ${previous.name}'s membership to ${status}`,
    actor: access.user,
    metadata: { previousStatus: previous.status, status },
  });

  if (status === "suspended" && previous.status !== "suspended") {
    await sendInBackground(() => notifySuspension(id));
  }

  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/circulation");
  revalidatePath("/fines");
  return {
    message:
      status === "active"
        ? "Membership reactivated."
        : status === "suspended"
          ? "Membership suspended."
          : "Membership marked expired.",
    ok: true,
  };
}

export async function renewMembership(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("members.manage", "renew a membership");
  if (!access.ok) return { message: access.message };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id < 1) return { message: "Member not found." };

  const [member] = await sql<{ name: string; status: MemberStatus }[]>`
    select name, status from members where id = ${id}
  `;
  if (!member) return { message: "Member not found." };

  const lending = await getLendingSettings();

  if (lending.membershipMonths <= 0) {
    await sql`
      update members
      set status = 'active', membership_expires_on = null
      where id = ${id}
    `;
    await logAudit({
      action: "member.membership_renewed",
      entityType: "member",
      entityId: id,
      summary: `${access.user.name} reactivated ${member.name}'s membership without an expiry`,
      actor: access.user,
      metadata: { months: 0 },
    });
    revalidatePath("/members");
    revalidatePath(`/members/${id}`);
    revalidatePath("/dashboard");
    revalidatePath("/circulation");
    revalidatePath("/fines");
    return {
      message:
        "Membership reactivated. No expiry is configured, so it stays valid until suspended.",
      ok: true,
    };
  }

  const [updated] = await sql<{ expires: string }[]>`
    update members
    set
      status = 'active',
      membership_expires_on = (
        greatest(coalesce(membership_expires_on, current_date), current_date)
        + make_interval(months => ${lending.membershipMonths})
      )::date
    where id = ${id}
    returning to_char(membership_expires_on, 'DD Mon YYYY') as expires
  `;
  if (!updated) return { message: "Member not found." };

  await logAudit({
    action: "member.membership_renewed",
    entityType: "member",
    entityId: id,
    summary: `${access.user.name} renewed ${member.name}'s membership to ${updated.expires}`,
    actor: access.user,
    metadata: { months: lending.membershipMonths, expires: updated.expires },
  });

  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/circulation");
  revalidatePath("/fines");
  return {
    message: `Membership renewed until ${updated.expires}.`,
    ok: true,
  };
}

export async function deleteMember(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("members.manage", "delete a member");
  if (!access.ok) return { message: access.message };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id < 1) return { message: "Member not found." };

  // borrowing history references the member, so only never-borrowed
  // members can be removed without losing records
  const [counts] = await sql`
    select
      count(*)::int as total,
      count(*) filter (where returned_on is null)::int as open
    from loans
    where member_id = ${id}
  `;
  if (counts.open > 0) {
    return {
      message: `This member has ${counts.open} ${
        counts.open === 1 ? "book" : "books"
      } on loan. Record the returns first.`,
    };
  }
  if (counts.total > 0) {
    return {
      message: `This member has ${counts.total} completed ${
        counts.total === 1 ? "loan" : "loans"
      } on record. Borrowing history must be kept, so suspend the membership instead of deleting it.`,
    };
  }

  const [deleted] = await sql`
    delete from members where id = ${id} returning id, name
  `;
  if (!deleted) return { message: "Member not found." };

  await logAudit({
    action: "member.deleted",
    entityType: "member",
    entityId: deleted.id as number,
    summary: `${access.user.name} deleted member ${deleted.name}`,
    actor: access.user,
  });

  revalidatePath("/members");
  revalidatePath("/dashboard");
  revalidatePath("/circulation");
  redirect("/members");
}

export async function lendBook(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("circulation.manage", "lend a book");
  if (!access.ok) return { message: access.message };

  const bookId = Number(formData.get("bookId"));
  const memberId = Number(formData.get("memberId"));
  const daysText = String(formData.get("days") ?? "").trim();

  if (!Number.isInteger(bookId) || bookId < 1) {
    return { message: "Book not found." };
  }
  if (!Number.isInteger(memberId) || memberId < 1) {
    return { message: "Please choose a member." };
  }
  if (
    daysText &&
    (!/^\d{1,3}$/.test(daysText) ||
      Number(daysText) < 1 ||
      Number(daysText) > 365)
  ) {
    return {
      message: "Borrowing duration must be a whole number between 1 and 365 days.",
    };
  }

  type LendOutcome =
    | { error: string }
    | {
        ok: true;
        loanId: number;
        title: string;
        member: string;
        due: string;
        days: number;
      };

  let outcome: LendOutcome;
  try {
    outcome = await sql.begin(async (tx): Promise<LendOutcome> => {
      // lock the member first so their limit cannot be exceeded by parallel checkouts
      const [member] = await tx`
        select
          id,
          name,
          status,
          loan_limit,
          to_char(membership_expires_on, 'DD Mon YYYY') as expires,
          (
            membership_expires_on is not null
            and membership_expires_on < current_date
          ) as membership_expired
        from members
        where id = ${memberId}
        for update
      `;
      if (!member) return { error: "Member not found." };
      if (member.membership_expired) {
        if (member.status === "active") {
          await tx`
            update members set status = 'expired' where id = ${memberId}
          `;
        }
        return {
          error: `This membership expired on ${member.expires}. Renew it before lending.`,
        };
      }
      if (member.status !== "active") {
        return {
          error: `This membership is ${member.status}. Reactivate it before lending.`,
        };
      }

      const [book] = await tx`
        select id, title, total_copies
        from books
        where id = ${bookId}
        for update
      `;
      if (!book) return { error: "Book not found." };

      const [duplicate] = await tx`
        select id
        from loans
        where member_id = ${memberId}
          and book_id = ${bookId}
          and returned_on is null
      `;
      if (duplicate) {
        return {
          error: `This member already has "${book.title}" on loan (loan #${duplicate.id}). Renew that loan instead.`,
        };
      }

      const [open] = await tx`
        select count(*)::int as count
        from loans
        where book_id = ${bookId} and returned_on is null
      `;
      if (open.count >= book.total_copies) {
        return {
          error: `All ${book.total_copies} ${
            book.total_copies === 1 ? "copy is" : "copies are"
          } already on loan.`,
        };
      }

      if (member.loan_limit <= 0) {
        return {
          error: "Borrowing is disabled for this membership. Raise the borrowing limit first.",
        };
      }

      const [held] = await tx`
        select count(*)::int as count
        from loans
        where member_id = ${memberId} and returned_on is null
      `;
      if (held.count >= member.loan_limit) {
        return {
          error: `${member.name} already has ${held.count} of ${member.loan_limit} allowed books on loan. Record a return or raise the borrowing limit.`,
        };
      }

      let days = Number(daysText);
      if (!daysText) {
        const [settings] = await tx`
          select default_loan_days from circulation_settings where id
        `;
        days = settings?.default_loan_days ?? 14;
      }

      const [created] = await tx`
        insert into loans (book_id, member_id, borrowed_on, due_on, duration_days)
        values (
          ${bookId}, ${memberId}, current_date,
          current_date + ${days}::int, ${days}
        )
        returning id, to_char(due_on, 'DD Mon YYYY') as due
      `;

      return {
        ok: true as const,
        loanId: created.id as number,
        title: book.title,
        member: member.name,
        due: created.due,
        days,
      };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return {
        message:
          "This member already has a copy of this book on loan. Renew that loan instead.",
      };
    }
    throw error;
  }

  if ("error" in outcome) return { message: outcome.error };

  await logAudit({
    action: "loan.created",
    entityType: "loan",
    entityId: outcome.loanId,
    summary: `${access.user.name} lent "${outcome.title}" to ${outcome.member}`,
    actor: access.user,
    metadata: { days: outcome.days, due: outcome.due },
  });

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/circulation");
  await sendInBackground(() =>
    notifyBorrowingConfirmation(outcome.loanId)
  );
  return {
    message: `"${outcome.title}" lent to ${outcome.member} for ${outcome.days} days · due ${outcome.due}.`,
    ok: true,
  };
}

export async function renewLoan(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("circulation.manage", "renew a loan");
  if (!access.ok) return { message: access.message };

  const loanId = Number(formData.get("loanId"));
  const daysText = String(formData.get("days") ?? "").trim();

  if (!Number.isInteger(loanId) || loanId < 1) {
    return { message: "Loan not found." };
  }
  if (
    daysText &&
    (!/^\d{1,3}$/.test(daysText) ||
      Number(daysText) < 1 ||
      Number(daysText) > 365)
  ) {
    return {
      message: "Renewal length must be a whole number between 1 and 365 days.",
    };
  }

  type RenewOutcome =
    | { error: string }
    | {
        ok: true;
        title: string;
        memberId: number;
        days: number;
        due: string;
      };

  const outcome = await sql.begin(async (tx): Promise<RenewOutcome> => {
    const [loan] = await tx`
      select
        l.id,
        l.member_id,
        l.returned_on,
        l.duration_days,
        b.title
      from loans l
      join books b on b.id = l.book_id
      where l.id = ${loanId}
      for update of l
    `;
    if (!loan) return { error: "Loan not found." };
    if (loan.returned_on) {
      return { error: "This loan is already closed and cannot be renewed." };
    }

    // capture fines for days already overdue before the due date moves
    await tx`select accrue_fines()`;

    const days = daysText ? Number(daysText) : loan.duration_days;
    const [updated] = await tx`
      update loans
      set
        due_on = greatest(due_on, current_date) + ${days}::int,
        duration_days = ${days},
        renewal_count = renewal_count + 1
      where id = ${loanId}
      returning to_char(due_on, 'DD Mon YYYY') as due
    `;

    return {
      ok: true as const,
      title: loan.title,
      memberId: loan.member_id,
      days,
      due: updated.due,
    };
  });

  if ("error" in outcome) return { message: outcome.error };

  await logAudit({
    action: "loan.renewed",
    entityType: "loan",
    entityId: loanId,
    summary: `${access.user.name} renewed "${outcome.title}" for ${outcome.days} days`,
    actor: access.user,
    metadata: { due: outcome.due, memberId: outcome.memberId },
  });

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/members");
  revalidatePath(`/members/${outcome.memberId}`);
  revalidatePath("/circulation");
  revalidatePath("/fines");
  return {
    message: `"${outcome.title}" renewed for ${outcome.days} days · due ${outcome.due}.`,
    ok: true,
  };
}

export async function updateCirculationSettings(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("settings.manage", "change circulation settings");
  if (!access.ok) return { message: access.message };

  const daysText = String(formData.get("defaultLoanDays") ?? "").trim();

  if (!/^\d{1,3}$/.test(daysText)) {
    return {
      message: "Default borrowing period must be a whole number of days.",
    };
  }
  const days = Number(daysText);
  if (days < 1 || days > 365) {
    return {
      message: "Default borrowing period must be between 1 and 365 days.",
    };
  }

  await sql`
    update circulation_settings
    set default_loan_days = ${days}, updated_at = now()
    where id
  `;

  await logAudit({
    action: "settings.circulation_updated",
    entityType: "settings",
    entityId: "circulation",
    summary: `${access.user.name} set the default loan period to ${days} days`,
    actor: access.user,
  });

  revalidatePath("/circulation");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return { message: `Default borrowing period set to ${days} days.`, ok: true };
}

export async function returnBook(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("circulation.manage", "record a return");
  if (!access.ok) return { message: access.message };

  const loanId = Number(formData.get("loanId"));
  const bookId = Number(formData.get("bookId"));
  const hasLoanId = Number.isInteger(loanId) && loanId > 0;
  const hasBookId = Number.isInteger(bookId) && bookId > 0;

  if (!hasLoanId && !hasBookId) return { message: "Loan not found." };

  type ReturnedRow = { id: number; member_id: number };

  const returned = await sql.begin(
    async (tx): Promise<ReturnedRow[]> => {
      const [loan] = hasLoanId
        ? await tx`
            select id, member_id
            from loans
            where id = ${loanId} and returned_on is null
            for update
          `
        : await tx`
            select id, member_id
            from loans
            where id = (
              select id from loans
              where book_id = ${bookId} and returned_on is null
              order by id
              limit 1
            )
            for update
          `;
      if (!loan) return [];

      // charge the days this copy was late before closing the loan
      await tx`select accrue_fines()`;

      const [updated] = await tx`
        update loans
        set returned_on = current_date
        where id = ${loan.id} and returned_on is null
        returning id, member_id
      `;
      return updated ? [updated as ReturnedRow] : [];
    }
  );

  if (returned.length === 0) return { message: "This loan is already closed." };

  await logAudit({
    action: "loan.returned",
    entityType: "loan",
    entityId: returned[0].id,
    summary: `${access.user.name} recorded return of loan #${returned[0].id}`,
    actor: access.user,
    metadata: { memberId: returned[0].member_id },
  });

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/members");
  revalidatePath(`/members/${returned[0].member_id}`);
  revalidatePath("/circulation");
  revalidatePath("/fines");
  await sendInBackground(() =>
    notifyReturnConfirmation(returned[0].id)
  );
  return { message: "Book returned.", ok: true };
}

export async function updateFineSettings(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("settings.manage", "change fine settings");
  if (!access.ok) return { message: access.message };

  const enabled = formData.get("enabled") === "on";
  const rateText = String(formData.get("finePerDay") ?? "").trim();
  const graceRaw = formData.get("fineGraceDays");

  if (!/^\d{1,5}(\.\d{1,2})?$/.test(rateText)) {
    return {
      message: "Daily fine must be a number between 0 and 10000, with up to two decimals.",
    };
  }
  const rate = Number(rateText);
  if (rate > 10000) {
    return { message: "Daily fine cannot be higher than 10000." };
  }
  if (enabled && rate <= 0) {
    return {
      message: "Set a daily fine above zero before turning fines on.",
    };
  }

  let grace: number;
  if (graceRaw === null) {
    const [current] = await sql<{ fine_grace_days: number }[]>`
      select fine_grace_days from circulation_settings where id
    `;
    grace = current?.fine_grace_days ?? 0;
  } else {
    const graceText = String(graceRaw).trim();
    if (!/^\d{1,2}$/.test(graceText) || Number(graceText) > 30) {
      return {
        message: "Grace period must be a whole number between 0 and 30 days.",
      };
    }
    grace = Number(graceText);
  }

  await sql`
    update circulation_settings
    set
      fine_enabled = ${enabled},
      fine_per_day = ${rate.toFixed(2)},
      fine_grace_days = ${grace},
      fine_effective_on = case
        when ${enabled} and not fine_enabled then current_date
        else fine_effective_on
      end,
      updated_at = now()
    where id
  `;

  if (enabled) await sql`select accrue_fines()`;

  await logAudit({
    action: "settings.fines_updated",
    entityType: "settings",
    entityId: "fines",
    summary: `${access.user.name} ${
      enabled ? `enabled fines at ${rate.toFixed(2)} per day` : "disabled fines"
    }`,
    actor: access.user,
    metadata: { enabled, rate: rate.toFixed(2), graceDays: grace },
  });

  revalidatePath("/fines");
  revalidatePath("/settings");
  revalidatePath("/circulation");
  revalidatePath("/dashboard");
  return {
    message: enabled
      ? `Fines enabled at ${rate.toFixed(2)} per overdue day${
          grace > 0 ? ` after a ${grace}-day grace period` : ""
        }.`
      : "Fines disabled. No new charges will be added; existing balances can still be settled.",
    ok: true,
  };
}

const MONEY_PATTERN = /^\d{1,7}(\.\d{1,2})?$/;

function toCents(value: unknown) {
  return Math.round(Number(value ?? 0) * 100);
}

function formatCents(cents: number) {
  return (cents / 100).toFixed(2);
}

function checkMoney(text: string) {
  if (!MONEY_PATTERN.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 100_000_000) return null;
  return cents;
}

function checkPaymentDate(text: string) {
  if (!text) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  return !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
}

type SettledOutcome =
  | { error: string }
  | { ok: true; message: string; memberId: number };

async function settleFine(
  loanId: number,
  kind: "payment" | "waiver",
  amountText: string,
  paidOn: string,
  reason: string | null
): Promise<SettledOutcome> {
  const cents = checkMoney(amountText);
  const label = kind === "payment" ? "payment" : "waiver";

  return sql.begin(async (tx): Promise<SettledOutcome> => {
    const [loan] = await tx`
      select l.id, l.member_id, l.borrowed_on
      from loans l
      where l.id = ${loanId}
      for update
    `;
    if (!loan) return { error: "Loan not found." };

    await tx`select accrue_fines()`;

    const [totals] = await tx`
      select
        coalesce(
          (select sum(amount) from fine_charges where loan_id = ${loanId}), 0
        ) as charged,
        coalesce(
          (select sum(amount) from fine_payments where loan_id = ${loanId}), 0
        ) as settled
    `;
    const balance = toCents(totals.charged) - toCents(totals.settled);

    if (balance <= 0) {
      return { error: "This loan has no outstanding fine." };
    }
    if (cents === null) {
      return {
        error: `Enter a ${label} amount above zero with at most two decimals.`,
      };
    }
    if (cents > balance) {
      return {
        error: `${kind === "payment" ? "Payment" : "Waiver"} cannot exceed the outstanding balance of ${formatCents(balance)}.`,
      };
    }

    if (paidOn) {
      const [dates] = await tx`
        select
          (${paidOn}::date > current_date) as future,
          (${paidOn}::date < ${loan.borrowed_on}::date) as before_loan
      `;
      if (dates.future) {
        return { error: "The recorded date cannot be in the future." };
      }
      if (dates.before_loan) {
        return { error: "The recorded date cannot be before the loan was borrowed." };
      }
    }

    await tx`
      insert into fine_payments (loan_id, kind, amount, recorded_on, reason)
      values (
        ${loanId}, ${kind}, ${formatCents(cents)},
        coalesce(${paidOn || null}::date, current_date), ${reason}
      )
    `;

    const remaining = balance - cents;
    return {
      ok: true,
      memberId: loan.member_id,
      message:
        remaining === 0
          ? `${kind === "payment" ? "Payment" : "Waiver"} of ${formatCents(cents)} recorded. The fine is fully ${kind === "payment" ? "paid" : "waived"}.`
          : `${kind === "payment" ? "Payment" : "Waiver"} of ${formatCents(cents)} recorded · ${formatCents(remaining)} still outstanding.`,
    };
  });
}

function revalidateFinePaths(memberId: number) {
  revalidatePath("/fines");
  revalidatePath("/circulation");
  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/dashboard");
}

export async function recordFinePayment(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("fines.manage", "record a fine payment");
  if (!access.ok) return { message: access.message };

  const loanId = Number(formData.get("loanId"));
  const amountText = String(formData.get("amount") ?? "").trim();
  const paidOn = String(formData.get("paidOn") ?? "").trim();

  if (!Number.isInteger(loanId) || loanId < 1) {
    return { message: "Loan not found." };
  }
  if (!checkPaymentDate(paidOn)) {
    return { message: "Enter a valid payment date." };
  }

  const outcome = await settleFine(loanId, "payment", amountText, paidOn, null);
  if ("error" in outcome) return { message: outcome.error };

  await logAudit({
    action: "fine.payment_recorded",
    entityType: "loan",
    entityId: loanId,
    summary: `${access.user.name} recorded a fine payment of ${amountText} on loan #${loanId}`,
    actor: access.user,
    metadata: { amount: amountText, paidOn: paidOn || "today" },
  });

  revalidateFinePaths(outcome.memberId);
  return { message: outcome.message, ok: true };
}

export async function waiveFine(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize("fines.manage", "waive a fine");
  if (!access.ok) return { message: access.message };

  const loanId = Number(formData.get("loanId"));
  const amountText = String(formData.get("amount") ?? "").trim();
  const waivedOn = String(formData.get("waivedOn") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!Number.isInteger(loanId) || loanId < 1) {
    return { message: "Loan not found." };
  }
  if (!checkPaymentDate(waivedOn)) {
    return { message: "Enter a valid waiver date." };
  }
  if (reason.length < 3) {
    return {
      message: "Record a reason of at least 3 characters for the waiver.",
    };
  }
  if (reason.length > 500) {
    return { message: "Waiver reasons must be 500 characters or fewer." };
  }

  const outcome = await settleFine(loanId, "waiver", amountText, waivedOn, reason);
  if ("error" in outcome) return { message: outcome.error };

  await logAudit({
    action: "fine.waived",
    entityType: "loan",
    entityId: loanId,
    summary: `${access.user.name} waived ${amountText} on loan #${loanId}`,
    actor: access.user,
    metadata: { amount: amountText, waivedOn: waivedOn || "today", reason },
  });

  revalidateFinePaths(outcome.memberId);
  return { message: outcome.message, ok: true };
}

export async function updateNotificationSettings(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const access = await authorize(
    "notifications.manage",
    "change notification preferences"
  );
  if (!access.ok) return { message: access.message };

  const checked = (name: string) => formData.get(name) === "on";
  const emailEnabled = checked("emailEnabled");
  const borrowingConfirmation = checked("borrowingConfirmation");
  const returnConfirmation = checked("returnConfirmation");
  const dueReminders = checked("dueReminders");
  const overdueNotices = checked("overdueNotices");
  const suspensionNotices = checked("suspensionNotices");
  const adminOverdueAlerts = checked("adminOverdueAlerts");

  const reminderText = String(formData.get("reminderDaysBefore") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();

  if (!/^\d{1,2}$/.test(reminderText) || Number(reminderText) > 30) {
    return {
      message: "Reminder lead time must be a whole number between 0 and 30 days.",
    };
  }
  if (
    adminEmail &&
    (adminEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail))
  ) {
    return { message: "Enter a valid administrator email address, or leave it empty." };
  }
  if (adminOverdueAlerts && !adminEmail) {
    return {
      message: "Add an administrator email before enabling overdue alerts.",
    };
  }

  await sql`
    update notification_settings
    set
      email_enabled = ${emailEnabled},
      borrowing_confirmation = ${borrowingConfirmation},
      return_confirmation = ${returnConfirmation},
      due_reminders = ${dueReminders},
      overdue_notices = ${overdueNotices},
      suspension_notices = ${suspensionNotices},
      admin_overdue_alerts = ${adminOverdueAlerts},
      reminder_days_before = ${Number(reminderText)},
      admin_email = ${adminEmail || null},
      updated_at = now()
    where id
  `;

  await logAudit({
    action: "settings.notifications_updated",
    entityType: "settings",
    entityId: "notifications",
    summary: `${access.user.name} updated notification preferences`,
    actor: access.user,
    metadata: { emailEnabled, dueReminders, overdueNotices },
  });

  revalidatePath("/notifications");
  revalidatePath("/settings");
  return { message: "Notification preferences saved.", ok: true };
}

export async function runNotificationsNow(
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  void _prev;
  void _formData;
  const access = await authorize("notifications.manage", "run notifications");
  if (!access.ok) return { message: access.message };

  const summary = await runNotificationCycle();
  await logAudit({
    action: "notifications.run",
    entityType: "notifications",
    summary: `${access.user.name} ran the notification cycle`,
    actor: access.user,
    metadata: { ...summary },
  });
  revalidatePath("/notifications");
  return { message: describeRun(summary), ok: true };
}
