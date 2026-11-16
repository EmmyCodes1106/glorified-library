import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { BookOpen, MapPin, Search } from "lucide-react";
import sql from "@/db";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import AddBookForm from "@/components/add-book-form";
import BookActions from "@/components/book-actions";
import { EmptyState, PageIntro } from "@/components/ui";

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
  const location = [
    book.shelf && `Shelf ${book.shelf}`,
    book.rack && `Rack ${book.rack}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="card card-hover min-w-0 p-4 sm:p-5">
      <div className="flex gap-4">
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg border bg-surface-2 sm:h-36 sm:w-24">
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
            <div className="flex h-full w-full items-center justify-center text-brand/40">
              <BookOpen size={28} strokeWidth={1.75} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="break-words text-base font-semibold tracking-tight sm:text-lg">
                {book.title}
              </h2>
              <p className="text-sm text-muted">
                {book.author}
                {book.year ? ` · ${book.year}` : ""}
              </p>
            </div>
            <span
              className={`badge shrink-0 ${
                available > 0 ? "badge-success" : "badge-warning"
              }`}
            >
              {available > 0 ? `${available} available` : "Fully on loan"}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="badge badge-neutral">ID {book.book_code}</span>
            {book.isbn && (
              <span className="badge badge-neutral">ISBN {book.isbn}</span>
            )}
            {book.category && (
              <span className="badge badge-info">{book.category}</span>
            )}
            {book.genres.map((genre) => (
              <span key={genre} className="badge badge-neutral">
                {genre}
              </span>
            ))}
          </div>

          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <MapPin size={13} strokeWidth={2} aria-hidden="true" />
            {location || "Shelf and rack not set"}
          </p>

          {book.description && (
            <p className="mt-2 line-clamp-2 break-words text-sm text-muted">
              {book.description}
            </p>
          )}

          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Total
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {book.total_copies}
              </dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Borrowed
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-warning">
                {borrowed}
              </dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Available
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-success">
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
      <form method="get" className="card p-4" role="search">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="grid gap-1 sm:col-span-2 lg:col-span-1">
            <span className="label">Search</span>
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Title, author, ISBN or book ID"
              className="field w-full"
            />
          </label>

          <label className="grid gap-1">
            <span className="label">Category</span>
            <select name="category" defaultValue={category} className="field w-full">
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="label">Publication year</span>
            <select
              name="year"
              defaultValue={year ? String(year) : ""}
              className="field w-full"
            >
              <option value="">All years</option>
              {years.map((item) => (
                <option key={item.year} value={item.year}>
                  {item.year}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="label">Availability</span>
            <select
              name="availability"
              defaultValue={availability}
              className="field w-full"
            >
              <option value="">All availability</option>
              <option value="available">Available copies</option>
              <option value="borrowed">On loan</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <button className="btn btn-primary">
            <Search size={15} strokeWidth={2.25} aria-hidden="true" />
            Apply filters
          </button>
          {hasFilters && (
            <Link
              href="/"
              className="text-sm font-medium text-muted hover:text-foreground hover:underline"
            >
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          <span className="font-semibold text-foreground">{books.length}</span>{" "}
          {books.length === 1 ? "title" : "titles"} ·{" "}
          <span className="font-semibold text-foreground">{totalCopies}</span>{" "}
          {totalCopies === 1 ? "copy" : "copies"} ·{" "}
          <span className="font-semibold text-success">{availableCopies}</span>{" "}
          available
        </p>
      </div>

      {books.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={hasFilters ? "No books match these filters" : "No books yet"}
          description={
            hasFilters
              ? "Try a different search or clear the filters to see the full catalogue."
              : "Add the first title above to start building the collection."
          }
          action={
            hasFilters ? (
              <Link href="/" className="btn btn-sm btn-secondary">
                Clear filters
              </Link>
            ) : undefined
          }
        />
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
    <div className="space-y-4" aria-hidden="true">
      <div className="card h-32" />
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="card h-44" />
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
    <div className="space-y-6">
      <PageIntro>
        Browse the catalogue, follow available copies and manage each title&apos;s
        lending in one place.
      </PageIntro>

      {canManage && <AddBookForm />}

      <Suspense fallback={<InventorySkeleton />}>
        <Inventory
          searchParams={searchParams}
          canManage={canManage}
          canCirculate={canCirculate}
        />
      </Suspense>
    </div>
  );
}
