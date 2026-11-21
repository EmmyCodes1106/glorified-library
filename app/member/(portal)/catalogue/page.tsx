import Image from "next/image";
import Link from "next/link";
import { BookOpen, MapPin, Search } from "lucide-react";
import { requireMember } from "@/lib/member-auth/dal";
import {
  getCatalogueCategories,
  getDefaultLoanDays,
  searchCatalogue,
} from "@/lib/member-portal";
import { EmptyState, Notice } from "@/components/ui";
import MemberBorrowButton from "@/components/member-borrow-button";

export const metadata = {
  title: "Catalogue",
};

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function MemberCataloguePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireMember();
  const params = await searchParams;
  const q = first(params.q).trim();
  const category = first(params.category).trim();
  const availableOnly = first(params.available) === "1";

  const [books, categories, days] = await Promise.all([
    searchCatalogue(member.id, { q, category, availableOnly }),
    getCatalogueCategories(),
    getDefaultLoanDays(),
  ]);

  const active = member.status === "active";
  const hasFilters = Boolean(q || category || availableOnly);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Catalogue</h2>
        <p className="mt-1 text-sm text-muted">
          Browse the shelves and borrow a book straight from here. Loans run for{" "}
          {days} days unless the library renews them.
        </p>
      </div>

      {!active && (
        <Notice tone="warning">
          {member.status === "suspended"
            ? "Your membership is suspended, so borrowing is unavailable. Contact the library to reactivate it."
            : "Your membership has expired, so borrowing is unavailable. Contact the library to renew it."}
        </Notice>
      )}

      <form method="get" className="card p-4" role="search">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
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
            <select
              name="category"
              defaultValue={category}
              className="field w-full"
            >
              <option value="">All categories</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col justify-end gap-2 sm:flex-row sm:items-end">
            <label className="flex items-center gap-2 pb-2 text-sm text-muted sm:pb-1.5">
              <input
                type="checkbox"
                name="available"
                value="1"
                defaultChecked={availableOnly}
                className="h-4 w-4 rounded border-line"
              />
              Available only
            </label>
            <button className="btn btn-secondary btn-sm">
              <Search size={14} aria-hidden="true" />
              Search
            </button>
          </div>
        </div>
      </form>

      <p className="text-sm text-muted">
        {books.length} {books.length === 1 ? "book" : "books"}
        {hasFilters
          ? books.length === 1
            ? " matches your filters"
            : " match your filters"
          : " in the catalogue"}
        {hasFilters && (
          <>
            {" · "}
            <Link
              href="/member/catalogue"
              className="text-brand underline-offset-4 hover:underline"
            >
              Clear filters
            </Link>
          </>
        )}
      </p>

      {books.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No books found"
          description={
            hasFilters
              ? "Try a different search term or clear the filters."
              : "The catalogue is empty. Ask library staff to add books."
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {books.map((book) => {
            const available = Math.max(0, book.total_copies - book.open_loans);
            const location = [
              book.shelf && `Shelf ${book.shelf}`,
              book.rack && `Rack ${book.rack}`,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <li key={book.id} className="card card-hover min-w-0 p-4 sm:p-5">
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
                        <h3 className="break-words text-base font-semibold tracking-tight sm:text-lg">
                          {book.title}
                        </h3>
                        <p className="text-sm text-muted">
                          {book.author}
                          {book.year ? ` · ${book.year}` : ""}
                        </p>
                      </div>
                      <span
                        className={`badge shrink-0 ${
                          book.on_loan_to_member
                            ? "badge-info"
                            : available > 0
                              ? "badge-success"
                              : "badge-warning"
                        }`}
                      >
                        {book.on_loan_to_member
                          ? "On loan to you"
                          : available > 0
                            ? `${available} available`
                            : "All copies on loan"}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="badge badge-neutral">
                        ID {book.book_code}
                      </span>
                      {book.category && (
                        <span className="badge badge-info">{book.category}</span>
                      )}
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

                    <div className="mt-3">
                      {book.on_loan_to_member ? (
                        <Link
                          href="/member/loans"
                          className="text-sm font-medium text-brand underline-offset-4 hover:underline"
                        >
                          Manage this loan
                        </Link>
                      ) : !active ? (
                        <span className="badge badge-neutral">
                          Borrowing unavailable
                        </span>
                      ) : available > 0 ? (
                        <MemberBorrowButton bookId={book.id} days={days} />
                      ) : (
                        <p className="text-xs text-muted">
                          All {book.total_copies}{" "}
                          {book.total_copies === 1 ? "copy is" : "copies are"}{" "}
                          on loan right now.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
