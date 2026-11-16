"use client";

import { useRef, useState, useTransition } from "react";
import { BookOpen, Loader2, Search, X } from "lucide-react";
import {
  getOpenLibraryWorkAction,
  searchOpenLibraryAction,
} from "@/app/actions";
import type { OpenLibraryBook } from "@/lib/open-library";

function coverThumb(coverId: number | null): string | null {
  return coverId
    ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
    : null;
}

function setFieldValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);
  if (
    !(field instanceof HTMLInputElement) &&
    !(field instanceof HTMLTextAreaElement)
  ) {
    return;
  }
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

export default function BookLookup() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpenLibraryBook[]>([]);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<OpenLibraryBook | null>(null);
  const [searching, startSearch] = useTransition();

  function runSearch() {
    setMessage("");
    startSearch(async () => {
      const state = await searchOpenLibraryAction(query);
      if (!state.ok) {
        setResults([]);
        setMessage(state.message);
        return;
      }
      if (state.results.length === 0) {
        setResults([]);
        setMessage("No matches found on Open Library.");
        return;
      }
      setResults(state.results);
    });
  }

  function applyResult(book: OpenLibraryBook) {
    const form = containerRef.current?.closest("form");
    if (!form) return;

    setFieldValue(form, "title", book.title);
    if (book.author) setFieldValue(form, "author", book.author);
    if (book.year) setFieldValue(form, "year", String(book.year));
    if (book.isbn) setFieldValue(form, "isbn", book.isbn);

    const description = form.elements.namedItem("description");
    if (
      book.key &&
      description instanceof HTMLTextAreaElement &&
      !description.value.trim()
    ) {
      getOpenLibraryWorkAction(book.key).then((text) => {
        if (text) {
          const current = form.elements.namedItem("description");
          if (
            current instanceof HTMLTextAreaElement &&
            !current.value.trim()
          ) {
            setFieldValue(form, "description", text);
          }
        }
      });
    }

    const coverUrl = form.elements.namedItem("coverUrl");
    if (coverUrl instanceof HTMLInputElement) {
      coverUrl.value = book.coverId
        ? `https://covers.openlibrary.org/b/id/${book.coverId}-L.jpg`
        : "";
    }
    setSelected(book);

    const details = form.querySelector("details");
    if (details) details.open = true;
  }

  function clearCover() {
    const form = containerRef.current?.closest("form");
    const coverUrl = form?.elements.namedItem("coverUrl");
    if (coverUrl instanceof HTMLInputElement) coverUrl.value = "";
    setSelected(null);
  }

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-dashed border-line-strong bg-surface-2/50 p-3"
    >
      <p className="text-sm font-medium">Look up on Open Library</p>
      <p className="mt-1 text-xs text-muted">
        Search by title, author or ISBN to prefill this form. Review everything
        before adding.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              runSearch();
            }
          }}
          placeholder="e.g. Things Fall Apart"
          aria-label="Search Open Library"
          className="field w-full"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={searching || query.trim().length < 2}
          className="btn btn-secondary shrink-0"
        >
          {searching ? (
            <Loader2 size={15} aria-hidden="true" className="animate-spin" />
          ) : (
            <Search size={15} aria-hidden="true" />
          )}
          Search
        </button>
      </div>
      <input type="hidden" name="coverUrl" />

      {message && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {message}
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-3 space-y-2">
          {results.map((book) => {
            const thumb = coverThumb(book.coverId);
            return (
              <li key={book.key}>
                <button
                  type="button"
                  onClick={() => applyResult(book)}
                  className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-2 text-left transition-colors hover:border-brand hover:bg-brand-soft"
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="h-14 w-10 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-surface-2 text-muted">
                      <BookOpen size={16} aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {book.title}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {[
                        book.author,
                        book.year,
                        book.publisher,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-surface p-2">
          {coverThumb(selected.coverId) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverThumb(selected.coverId)!}
              alt=""
              className="h-14 w-10 shrink-0 rounded object-cover"
            />
          ) : (
            <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-surface-2 text-muted">
              <BookOpen size={16} aria-hidden="true" />
            </span>
          )}
          <p className="min-w-0 flex-1 text-xs text-muted">
            <span className="block truncate text-sm font-semibold text-foreground">
              {selected.title}
            </span>
            {selected.coverId
              ? "Form prefilled. The cover will be downloaded when you add the book."
              : "Form prefilled. No cover was found for this title."}
          </p>
          <button
            type="button"
            onClick={clearCover}
            className="btn btn-ghost btn-sm shrink-0"
          >
            <X size={14} aria-hidden="true" />
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
