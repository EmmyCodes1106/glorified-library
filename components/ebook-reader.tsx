"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

type ChapterPayload = {
  html: string;
  chapter: number;
  chapterCount: number;
  title: string;
  author: string;
  dueOn: string;
  member: { name: string; code: string };
};

type Props = {
  bookId: number;
  title: string;
  author: string;
  dueOn: string;
};

type ErrorState = { status: number; message: string };

function storageKey(bookId: number) {
  return `glorified-ebook-chapter:${bookId}`;
}

export default function EbookReader({ bookId, title, author, dueOn }: Props) {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [payload, setPayload] = useState<ChapterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchChapter = useCallback(
    async (index: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(
          `/api/member/read/${bookId}/chapter/${index}`,
          { signal: controller.signal, cache: "no-store" }
        );
        const body = (await response.json().catch(() => null)) as
          | (Partial<ChapterPayload> & { error?: string })
          | null;

        if (controller.signal.aborted) return;

        if (!response.ok || !body?.html) {
          setPayload(null);
          setError({
            status: response.status,
            message:
              body?.error ?? "This chapter could not be loaded right now.",
          });
          return;
        }

        const next = body as ChapterPayload;
        setPayload(next);
        setChapterIndex(next.chapter);
        try {
          window.localStorage.setItem(
            storageKey(bookId),
            String(next.chapter)
          );
        } catch {
          // progress is a convenience only
        }
      } catch (caught) {
        if ((caught as Error).name === "AbortError") return;
        setPayload(null);
        setError({
          status: 0,
          message: "The reader lost its connection. Check your network.",
        });
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [bookId]
  );

  useEffect(() => {
    // Resume where the member stopped; a stale index falls back to chapter 1
    // when the server says it no longer exists.
    let initial = 0;
    try {
      const saved = Number(window.localStorage.getItem(storageKey(bookId)));
      if (Number.isInteger(saved) && saved > 0) initial = saved;
    } catch {
      // storage can be blocked; start from the beginning
    }
    // Deferred one microtask so the effect body itself has no state writes;
    // fetchChapter() reports back through its own async continuation.
    void Promise.resolve().then(() => fetchChapter(initial));
    return () => abortRef.current?.abort();
  }, [bookId, fetchChapter]);

  const chapterCount = payload?.chapterCount ?? 0;
  const canPrev = chapterIndex > 0;
  const canNext = chapterCount > 0 && chapterIndex < chapterCount - 1;

  const go = useCallback(
    (index: number) => {
      if (index < 0) return;
      if (chapterCount > 0 && index >= chapterCount) return;
      setChapterIndex(index);
      setLoading(true);
      setError(null);
      void fetchChapter(index);
      top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
    [chapterCount, fetchChapter]
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (canPrev) go(chapterIndex - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (canNext) go(chapterIndex + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canNext, canPrev, chapterIndex, go]);

  const watermark = payload
    ? `${payload.member.name} · ${payload.member.code}`
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div ref={top} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/member/loans"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
          >
            <ArrowLeft size={15} strokeWidth={2.25} aria-hidden="true" />
            Back to my loans
          </Link>
          <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight">
            {payload?.title ?? title}
          </h1>
          <p className="text-sm text-muted">{payload?.author ?? author}</p>
        </div>
        <span className="badge badge-info">Due {payload?.dueOn ?? dueOn}</span>
      </div>

      <div className="reader-shell relative overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        {watermark && (
          <div
            aria-hidden="true"
            className="reader-watermark pointer-events-none absolute inset-0 z-10 select-none"
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index}>{watermark}</span>
            ))}
          </div>
        )}

        <div className="relative z-20 px-4 py-6 sm:px-8 sm:py-10">
          {loading && !payload ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Loading chapter...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full bg-warning-soft text-warning"
                aria-hidden="true"
              >
                <AlertTriangle size={20} strokeWidth={2} />
              </span>
              <p className="max-w-md text-sm text-muted">{error.message}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {error.status === 401 ? (
                  <Link href="/member/login" className="btn btn-sm btn-primary">
                    Sign in again
                  </Link>
                ) : (
                  <Link href="/member/loans" className="btn btn-sm btn-secondary">
                    View my loans
                  </Link>
                )}
              </div>
            </div>
          ) : payload ? (
            <article
              className="ebook-content"
              // sanitised on the server: scripts, styles, links and external
              // images are stripped before this HTML ever reaches the client
              dangerouslySetInnerHTML={{ __html: payload.html }}
            />
          ) : null}

          {payload && loading && (
            <p
              role="status"
              className="mt-6 flex items-center justify-center gap-2 text-xs text-muted"
            >
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              Loading chapter {chapterIndex + 1}...
            </p>
          )}
        </div>

        <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:gap-3 sm:px-8">
          <button
            type="button"
            onClick={() => go(chapterIndex - 1)}
            disabled={!canPrev || loading}
            className="btn btn-sm btn-secondary"
          >
            <ChevronLeft size={15} strokeWidth={2.25} aria-hidden="true" />
            Previous
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <label
              htmlFor="reader-chapter"
              className="hidden text-xs text-muted sm:inline"
            >
              Chapter
            </label>
            <select
              id="reader-chapter"
              className="field h-9 w-24 py-1 text-sm"
              value={chapterIndex}
              disabled={chapterCount === 0 || loading}
              onChange={(event) => go(Number(event.target.value))}
            >
              {Array.from({ length: Math.max(chapterCount, 1) }).map(
                (_, index) => (
                  <option key={index} value={index}>
                    {index + 1}
                  </option>
                )
              )}
            </select>
            <span className="text-xs text-muted">
              of {chapterCount || "—"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => go(chapterIndex + 1)}
            disabled={!canNext || loading}
            className="btn btn-sm btn-primary"
          >
            Next
            <ChevronRight size={15} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      </div>

      {chapterCount > 0 && (
        <div className="flex items-center gap-3" aria-hidden="true">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{
                width: `${Math.round(((chapterIndex + 1) / chapterCount) * 100)}%`,
              }}
            />
          </div>
          <span className="text-xs tabular-nums text-muted">
            {Math.round(((chapterIndex + 1) / chapterCount) * 100)}%
          </span>
        </div>
      )}

      <p className="text-xs text-muted">
        This online copy is tied to your open loan and the pages load straight
        from the library. The file itself is not downloadable, and access stops
        when the loan is returned.
      </p>
    </div>
  );
}
