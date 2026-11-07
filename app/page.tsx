import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import AppNav from "./app-nav";
import LibraryBrand from "./library-brand";
import AddBookForm from "./add-book-form";
import BookActions from "./book-actions";

export const metadata = {
  title: "Book inventory",
};

// every request needs the session cookie before any data is read
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type AvailableFilters = "" | "available" | "borrowed";

type BookRow = {
  id: number;
  book_code: string;
  title: string;
  author: string;
  year: number | null;
  isbn: string | null;
  category: string | null;
  description: string | null;
  cover_path: string | null;
  total_copies: number;
  shelf: string | null;
  rack: string | null;
  genres: string[];
  open_loans: number;
};

type LoanRow = {
  id: number;
  book_id: number;
  member: string;
  due: string;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function BookCard({
  book,
  loans,
  members,
  canManage,
  canCirculate,
}: {
  book: BookRow;
  loans: LoanRow[];
  members: { id: number; name: string }[];
  canManage: boolean;
  canCirculate: boolean;
}) {
  const borrowed = book.open_loans;
  const available = Math.max(0, book.total_copies - borrowed);
  const location = [book.shelf && `Shelf ${book.shelf}`, book.rack && `Rack ${book.rack}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="min-w-0 rounded-lg border p-4 sm:p-5">
      <div className="flex gap-4">
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded border bg-gray-100 dark:bg-gray-800 sm:h-36 sm:w-24">
          {book.cover_path ? (
            <Image
              src={book.cover_path}
              alt={`Cover of ${book.title}`}
              fill
              sizes="96px"
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-gray-400 dark:text-gray-500">
              {book.title.charAt(0)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="break-words text-base font-semibold sm:text-lg">
                {book.title}
              </h2>
              <p className="text-sm text-gray-500">
                {book.author}
                {book.year ? ` · ${book.year}` : ""}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                available > 0
                  ? "border-green-300 text-green-700 dark:border-green-800 dark:text-green-400"
                  : "border-orange-300 text-orange-700 dark:border-orange-800 dark:text-orange-400"
              }`}
            >
              {available > 0 ? `${available} available` : "Fully on loan"}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full border px-2 py-0.5 text-gray-600 dark:text-gray-300">
              ID {book.book_code}
            </span>
            {book.isbn && (
              <span className="rounded-full border px-2 py-0.5 text-gray-600 dark:text-gray-300">
                ISBN {book.isbn}
              </span>
            )}
            {book.category && (
              <span className="rounded-full border px-2 py-0.5 text-gray-600 dark:text-gray-300">
                {book.category}
              </span>
            )}
            {book.genres.map((genre) => (
              <span
                key={genre}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
              >
                {genre}
              </span>
            ))}
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {location || "Shelf and rack not set"}
          </p>

          {book.description && (
            <p className="mt-2 line-clamp-2 break-words text-sm text-gray-600 dark:text-gray-300">
              {book.description}
            </p>
          )}

          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded border p-2">
              <dt className="text-[11px] uppercase tracking-wide text-gray-500">
                Total
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {book.total_copies}
              </dd>
            </div>
            <div className="rounded border p-2">
              <dt className="text-[11px] uppercase tracking-wide text-gray-500">
                Borrowed
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                {borrowed}
              </dd>
            </div>
            <div className="rounded border p-2">
              <dt className="text-[11px] uppercase tracking-wide text-gray-500">
                Available
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">
                {available}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <BookActions
        book={{
          id: book.id,
          title: book.title,
          author: book.author,
          year: book.year,
          isbn: book.isbn,
          category: book.category,
          genres: book.genres,
          description: book.description,
          shelf: book.shelf,
          rack: book.rack,
          totalCopies: book.total_copies,
          coverPath: book.cover_path,
        }}
        available={available}
        members={members}
        canManage={canManage}
        canCirculate={canCirculate}
        loans={loans.map((loan) => ({
          id: loan.id,
          member: loan.member,
          due: loan.due,
        }))}
      />
    </li>
  );
}

async function Inventory({
  searchParams,
  canManage,
  canCirculate,
}: {
  searchParams: SearchParams;
  canManage: boolean;
  canCirculate: boolean;
}) {
  const params = await searchParams;
  const q = first(params.q).trim();
  const category = first(params.category).trim();
  const yearText = first(params.year).trim();
  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : null;
  const availabilityText = first(params.availability);
  const availability: AvailableFilters =
    availabilityText === "available" || availabilityText === "borrowed"
      ? availabilityText
      : "";

  const like = `%${q}%`;
  const availabilityClause =
    availability === "available"
      ? sql`and coalesce(l.open_loans, 0) < b.total_copies`
      : availability === "borrowed"
        ? sql`and coalesce(l.open_loans, 0) > 0`
        : sql``;

  const [books, categories, years, members] = await Promise.all([
    sql<BookRow[]>`
      select
        b.id,
        b.book_code,
        b.title,
        a.name as author,
        b.year,
        b.isbn,
        c.name as category,
        b.description,
        b.cover_path,
        b.total_copies,
        b.shelf,
        b.rack,
        coalesce((
          select array_agg(g.name order by g.name)
          from book_genres bg
          join genres g on g.id = bg.genre_id
          where bg.book_id = b.id
        ), '{}') as genres,
        coalesce(l.open_loans, 0) as open_loans
      from books b
      join authors a on a.id = b.author_id
      left join categories c on c.id = b.category_id
      left join (
        select book_id, count(*)::int as open_loans
        from loans
        where returned_on is null
        group by book_id
      ) l on l.book_id = b.id
      where (
        ${q} = ''
        or b.title ilike ${like}
        or a.name ilike ${like}
        or coalesce(b.isbn, '') ilike ${like}
        or b.book_code ilike ${like}
        or b.id::text = ${q}
      )
      ${category ? sql`and c.name = ${category}` : sql``}
      ${year ? sql`and b.year = ${year}` : sql``}
      ${availabilityClause}
      order by b.title
    `,
    sql<{ name: string }[]>`
      select c.name
      from categories c
      join books b on b.category_id = c.id
      group by c.name
      order by c.name
    `,
    sql<{ year: number }[]>`
      select distinct year
      from books
      where year is not null
      order by year desc
    `,
    sql<{ id: number; name: string }[]>`
      select id, name from members where status = 'active' order by name
    `,
  ]);

  const bookIds = books.map((book) => book.id);
  const loans =
    bookIds.length > 0
      ? await sql<LoanRow[]>`
          select
            l.id,
            l.book_id,
            m.name as member,
            to_char(l.due_on, 'DD Mon YYYY') as due
          from loans l
          join members m on m.id = l.member_id
          where l.returned_on is null and l.book_id = any(${bookIds})
          order by l.id
        `
      : [];

  const loansByBook = new Map<number, LoanRow[]>();
  for (const loan of loans) {
    const list = loansByBook.get(loan.book_id) ?? [];
    list.push(loan);
    loansByBook.set(loan.book_id, list);
  }

  const totalCopies = books.reduce((sum, book) => sum + book.total_copies, 0);
  const borrowedCopies = books.reduce((sum, book) => sum + book.open_loans, 0);
  const availableCopies = Math.max(0, totalCopies - borrowedCopies);
  const memberOptions = members.map((member) => ({
    id: member.id,
    name: member.name,
  }));
  const hasFilters = Boolean(q || category || year || availability);

  return (
    <>
      <form
        method="get"
        className="mb-4 rounded-lg border p-4"
        role="search"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-1">
            <span className="text-gray-500">Search</span>
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Title, author, ISBN or book ID"
              className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Category</span>
            <select
              name="category"
              defaultValue={category}
              className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
            >
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Publication year</span>
            <select
              name="year"
              defaultValue={year ? String(year) : ""}
              className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
            >
              <option value="">All years</option>
              {years.map((item) => (
                <option key={item.year} value={item.year}>
                  {item.year}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Availability</span>
            <select
              name="availability"
              defaultValue={availability}
              className="w-full min-w-0 rounded border bg-transparent p-2 text-sm"
            >
              <option value="">All availability</option>
              <option value="available">Available copies</option>
              <option value="borrowed">On loan</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <button className="rounded bg-white px-4 py-2 font-medium text-black">
            Apply filters
          </button>
          {hasFilters && (
            <Link href="/" className="underline">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-gray-500">
          <span className="font-medium text-foreground">{books.length}</span>{" "}
          {books.length === 1 ? "title" : "titles"} ·{" "}
          <span className="font-medium text-foreground">{totalCopies}</span>{" "}
          {totalCopies === 1 ? "copy" : "copies"} ·{" "}
          <span className="font-medium text-green-600 dark:text-green-400">
            {availableCopies}
          </span>{" "}
          available
        </p>
      </div>

      {books.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-gray-500">
          {hasFilters
            ? "No books match these filters. Try a different search or clear the filters."
            : "No books in the library yet. Add the first one above."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              loans={loansByBook.get(book.id) ?? []}
              members={memberOptions}
              canManage={canManage}
              canCirculate={canCirculate}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function InventorySkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="h-36 rounded-lg border" />
      <div className="mt-4 grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-48 rounded-lg border" />
        ))}
      </div>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const user = await requirePagePermission("books.read");
  const canManage = hasPermission(user, "books.manage");
  const canCirculate = hasPermission(user, "circulation.manage");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <LibraryBrand />
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Book inventory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Catalogue, copies, locations and lending in one place.
          </p>
        </div>
        <AppNav current="books" />
      </header>

      {canManage && <AddBookForm />}

      <Suspense fallback={<InventorySkeleton />}>
        <Inventory
          searchParams={searchParams}
          canManage={canManage}
          canCirculate={canCirculate}
        />
      </Suspense>
    </main>
  );
}
