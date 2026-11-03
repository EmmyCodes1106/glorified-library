"use server";

import { revalidatePath } from "next/cache";
import sql from "@/db";

export type FormState = { message: string; ok?: boolean };

export async function addBook(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const title = String(formData.get("title") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim();
  const yearText = String(formData.get("year") ?? "").trim();

  if (!title) return { message: "Please enter a title." };
  if (!author) return { message: "Please enter an author." };

  const year = Number(yearText);
  const thisYear = new Date().getFullYear();
  if (!/^\d{1,4}$/.test(yearText) || year < 1 || year > thisYear) {
    return { message: `Please enter a real year (1 to ${thisYear}).` };
  }

  // reuse the author if they already exist (ignoring upper/lower case)
  const [existing] = await sql`
    select id from authors where lower(name) = lower(${author})
  `;
  let authorId = existing?.id;

  if (!authorId) {
    const [created] = await sql`
      insert into authors (name) values (${author}) returning id
    `;
    authorId = created.id;
  }

  await sql`
    insert into books (title, year, author_id)
    values (${title}, ${year}, ${authorId})
  `;

  revalidatePath("/");
  return { message: "Book added.", ok: true };
}