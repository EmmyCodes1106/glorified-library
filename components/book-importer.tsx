"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CloudDownload,
  Info,
  Loader2,
  Search,
  Square,
} from "lucide-react";
import { importOpenLibraryBatchAction } from "@/app/import-actions";
import {
  IMPORT_BATCH_LIMIT,
  IMPORT_COPIES,
  IMPORT_MAX_BOOKS,
} from "@/lib/import-constants";
import { SectionHeader } from "./ui";

type Mode = "subject" | "query";

const RUN_SIZES = [10, 25, 50, 100, IMPORT_MAX_BOOKS];
const BATCH = IMPORT_BATCH_LIMIT;

const SUBJECT_SUGGESTIONS = [
  "African literature",
  "Science fiction",
  "Mystery and detective",
  "Poetry",
  "History",
  "Biography",
];

type Totals = {
  imported: number;
  duplicates: number;
  incomplete: number;
  failed: number;
};

const EMPTY_TOTALS: Totals = {
  imported: 0,
  duplicates: 0,
  incomplete: 0,
  failed: 0,
};

function processed(totals: Totals) {
  return totals.imported + totals.duplicates + totals.incomplete + totals.failed;
}

export default function BookImporter() {
  const [mode, setMode] = useState<Mode>("subject");
  const [term, setTerm] = useState("");
  const [target, setTarget] = useState(50);
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [seen, setSeen] = useState(0);
  const [available, setAvailable] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const cancelled = useRef(false);

  const done = processed(totals);

  async function startRun() {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setMessage("Type a subject or search term with at least 2 characters.");
      return;
    }

    cancelled.current = false;
    setRunning(true);
    setFinished(false);
    setMessage(null);
    setTotals(EMPTY_TOTALS);
    setSeen(0);
    setAvailable(null);

    let offset = 0;
    let scanned = 0;
    let batchTotals: Totals = { ...EMPTY_TOTALS };

    try {
      while (!cancelled.current) {
        const remaining = target - processed(batchTotals);
        if (remaining <= 0) break;

        const response = await importOpenLibraryBatchAction({
          mode,
          term: trimmed,
          offset,
          limit: Math.min(BATCH, remaining),
        });

        if (!response.ok) {
          setMessage(response.message);
          break;
        }

        const result = response.result;
        batchTotals = {
          imported: batchTotals.imported + result.imported,
          duplicates: batchTotals.duplicates + result.duplicates,
          incomplete: batchTotals.incomplete + result.incomplete,
          failed: batchTotals.failed + result.failed,
        };
        scanned += result.scanned;
        offset = result.nextOffset;

        setTotals({ ...batchTotals });
        setSeen(scanned);
        setAvailable(result.total);

        if (result.done || result.scanned === 0) break;
      }
    } catch {
      setMessage(
        "The import stopped unexpectedly. Books already added are safe — press Start to continue where you left off."
      );
    } finally {
      setRunning(false);
      setFinished(true);
    }
  }

  const percent =
    target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="card p-5 sm:p-6">
        <SectionHeader
          title="What to import"
          description={`Pulls matching works from Open Library and adds each new book with ${IMPORT_COPIES} copies.`}
        />

        <div className="mt-5 space-y-5">
          <div>
            <span className="text-sm font-medium text-foreground">Match by</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    value: "subject" as const,
                    title: "Subject",
                    hint: "e.g. Science fiction, Poetry",
                  },
                  {
                    value: "query" as const,
                    title: "Search query",
                    hint: "e.g. things fall apart",
                  },
                ]
              ).map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    mode === option.value
                      ? "border-brand-soft-border bg-brand-soft"
                      : "border-line hover:bg-surface-2"
                  } ${running ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <input
                    type="radio"
                    name="import-mode"
                    value={option.value}
                    checked={mode === option.value}
                    disabled={running}
                    onChange={() => setMode(option.value)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {option.title}
                    </span>
                    <span className="block text-xs text-muted">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="import-term" className="text-sm font-medium text-foreground">
              {mode === "subject" ? "Subject" : "Search term"}
            </label>
            <div className="relative mt-2">
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                id="import-term"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                disabled={running}
                maxLength={100}
                placeholder={
                  mode === "subject"
                    ? "Science fiction"
                    : "The Hobbit J. R. R. Tolkien"
                }
                className="field pl-9"
              />
            </div>
            {mode === "subject" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUBJECT_SUGGESTIONS.map((subject) => (
                  <button
                    key={subject}
                    type="button"
                    disabled={running}
                    onClick={() => setTerm(subject)}
                    className="rounded-full border border-line px-2.5 py-1 text-xs text-muted-strong transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-foreground disabled:opacity-60"
                  >
                    {subject}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="import-size" className="text-sm font-medium text-foreground">
                Books to pull
              </label>
              <select
                id="import-size"
                value={target}
                onChange={(event) => setTarget(Number(event.target.value))}
                disabled={running}
                className="field mt-2"
              >
                {RUN_SIZES.map((size) => (
                  <option key={size} value={size}>
                    Up to {size} books
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-sm font-medium text-foreground">Copies per book</span>
              <p className="mt-2 flex h-10 items-center rounded-lg border border-line bg-surface-2 px-3 text-sm text-muted-strong">
                {IMPORT_COPIES} copies, added automatically
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startRun}
              disabled={running || term.trim().length < 2}
              className="btn btn-primary"
            >
              {running ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <CloudDownload size={16} aria-hidden="true" />
              )}
              {running ? "Importing…" : "Start import"}
            </button>
            {running && (
              <button type="button" onClick={() => (cancelled.current = true)} className="btn btn-secondary">
                <Square size={14} aria-hidden="true" />
                Stop
              </button>
            )}
            {totals.imported > 0 && !running && (
              <Link href="/" className="btn btn-ghost">
                View catalogue
              </Link>
            )}
          </div>

          {message && (
            <p role="alert" className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
              {message}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="card p-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Progress</p>
            <p className="text-xs tabular-nums text-muted">
              {done} of {target}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Import progress"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={done}
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <dt className="text-xs text-muted">Imported</dt>
              <dd className="font-semibold tabular-nums text-foreground">{totals.imported}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <dt className="text-xs text-muted">Duplicates</dt>
              <dd className="font-semibold tabular-nums text-foreground">{totals.duplicates}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <dt className="text-xs text-muted">Missing author</dt>
              <dd className="font-semibold tabular-nums text-foreground">{totals.incomplete}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <dt className="text-xs text-muted">Failed</dt>
              <dd className="font-semibold tabular-nums text-foreground">{totals.failed}</dd>
            </div>
          </dl>

          {seen > 0 && (
            <p className="mt-3 text-xs text-muted">
              {seen} result{seen === 1 ? "" : "s"} scanned
              {available !== null &&
                ` · Open Library reports ${available.toLocaleString("en-GB")} matches`}
            </p>
          )}

          {finished && !running && done > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {totals.imported > 0
                  ? `${totals.imported} book${totals.imported === 1 ? "" : "s"} added with ${IMPORT_COPIES} copies each.`
                  : "No new books were added; everything in this slice is already in the catalogue."}
              </span>
            </p>
          )}
        </div>

        <div className="rounded-xl border border-brand-soft-border bg-brand-soft p-4 text-xs text-brand dark:text-foreground">
          <p className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Open Library holds far more works than any single run can reach. Each run
              pulls a slice of search results, skips books already in the catalogue by
              Open Library ID or ISBN, and keeps everything already imported if you stop.
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}
