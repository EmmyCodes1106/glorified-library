"use server";

import { revalidatePath } from "next/cache";
import sql from "@/db";

export type FormState = { message: string; ok?: boolean };

// checks what the user typed; returns an error message or clean values
function checkBook(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim();
  const yearText = String(formData.get("year") ?? "").trim();

  if (!title) return { error: "Please enter a title." };
  if (!author) return { error: "Please enter an author." };

  const year = Number(yearText);
  const thisYear = new Date().getFullYear();
  if (!/^\d{1,4}$/.test(yearText) || year < 1 || year > thisYear) {
    return { error: `Please enter a real year (1 to ${thisYear}).` };
  }
  return { title, author, year };
}

// reuse the author if they exist (ignoring upper/lower case), else add them
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

export async function addBook(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const checked = checkBook(formData);
  if ("error" in checked) return { message: checked.error };

  const authorId = await findOrCreateAuthor(checked.author);
  await sql`
    insert into books (title, year, author_id)
    values (${checked.title}, ${checked.year}, ${authorId})
  `;

  revalidatePath("/");
  return { message: "Book added.", ok: true };
}

export async function updateBook(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { message: "Book not found." };

  const checked = checkBook(formData);
  if ("error" in checked) return { message: checked.error };

  const authorId = await findOrCreateAuthor(checked.author);
  const updated = await sql`
    update books
    set title = ${checked.title}, year = ${checked.year}, author_id = ${authorId}
    where id = ${id}
    returning id
  `;
  if (updated.length === 0) return { message: "Book not found." };

  revalidatePath("/");
  return { message: "Book updated.", ok: true };
}

export async function deleteBook(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { message: "Book not found." };

  // a book that's out on loan can't be deleted
  const [onLoan] = await sql`
    select id from loans where book_id = ${id} and returned_on is null
  `;
  if (onLoan) {
    return { message: "This book is on loan. Record its return first." };
  }

  await sql`delete from books where id = ${id}`;

  revalidatePath("/");
  return { message: "Book deleted.", ok: true };
}
export async function addMember(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name) return { message: "Please enter a name." };
  if (phone && !/^[0-9+\-()\s]{6,20}$/.test(phone)) {
    return { message: "Please enter a valid phone number, or leave it empty." };
  }

  await sql`
    insert into members (name, phone)
    values (${name}, ${phone || null})
  `;

  revalidatePath("/members");
  return { message: "Member added.", ok: true };
}