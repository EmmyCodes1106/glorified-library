"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  CloudDownload,
  Info,
  Loader2,
  MinusCircle,
  Square,
} from "lucide-react";
import { fetchPublicDomainBatchAction } from "@/app/import-actions";
import { FETCH_BATCH_LIMIT, FETCH_MAX_BOOKS } from "@/lib/import-constants";
import { SectionHeader } from "./ui";
import type {
  PublicDomainBatchResult,
  PublicDomainItem,
} from "@/lib/public-domain";

const RUN_SIZES = [10, 25, FETCH_MAX_BOOKS];

type Totals = {
  attached: number;
  noMatch: number;
  unavailable: number;
  failed: number;
};

const EMPTY_TOTALS: Totals = {
  attached: 0,
  noMatch: 0,
  unavailable: 0,
  failed: 0,
};

function processed(totals: Totals) {
  return totals.attached + totals.noMatch + totals.unavailable + totals.failed;
}

function ItemRow({ item }: { item: PublicDomainItem }) {
  if (item.status === "attached" || item.status === "already") {
    return (
      <li className="flex items-start gap-2">
        <CheckCircle2
          size={14}
          className="mt-0.5 shrink-0 text-success"
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span className="font-medium text-foreground">{item.title}</span>
          <span className="text-muted">
            {" "}
            · Gutenberg #{item.gutenbergId}
            {item.chapters ? ` · ${item.chapters} chapters` : ""}
          </span>
        </span>
      </li>
    );
  }
  if (item.status === "no-match") {
    return (
      <li className="flex items-start gap-2">
        <MinusCircle
          size={14}
          className="mt-0.5 shrink-0 text-muted"
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span className="text-foreground">{item.title}</span>
          <span className="text-muted"> · no public-domain edition linked</span>
        </span>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-2">
      <AlertTriangle
        size={14}
        className="mt-0.5 shrink-0 text-warning"
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="text-foreground">{item.title}</span>
        <span className="text-muted"> · {item.detail ?? "could not be fetched"}</span>
      </span>
    </li>
  );
}

export default function PublicDomainFetcher({
  missingCount,
  pendingCount,
  totalCount,
}: {
  missingCount: number;
  pendingCount: number;
  totalCount: number;
}) {
  const [target, setTarget] = useState(10);
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [items, setItems] = useState<PublicDomainItem[]>([]);
  const [missing, setMissing] = useState(missingCount);
  const [pending, setPending] = useState(pendingCount);
  const [message, setMessage] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const cancelled = useRef(false);

  const done = processed(totals);
  const percent =
    target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const withCopy = Math.max(0, totalCount - missing);

  async function startRun() {
    cancelled.current = false;
    setRunning(true);
    setFinished(false);
    setMessage(null);
    setTotals(EMPTY_TOTALS);
    setItems([]);

    let cursor = 0;
    let batchTotals: Totals = { ...EMPTY_TOTALS };
    const seen: PublicDomainItem[] = [];

    try {
      while (!cancelled.current) {
        const budget = target - processed(batchTotals);
        if (budget <= 0) break;

        const response = await fetchPublicDomainBatchAction({
          cursor,
          limit: Math.min(FETCH_BATCH_LIMIT, budget),
        });

        if (!response.ok) {
          setMessage(response.message);
          break;
        }

        const result: PublicDomainBatchResult = response.result;
        batchTotals = {
          attached: batchTotals.attached + result.attached,
          noMatch: batchTotals.noMatch + result.noMatch,
          unavailable: batchTotals.unavailable + result.unavailable,
          failed: batchTotals.failed + result.failed,
        };
        for (const item of result.items) seen.push(item);
        cursor = result.nextCursor ?? cursor;

        setTotals({ ...batchTotals });
        setItems([...seen].reverse().slice(0, 8));
        setPending(result.remaining);
        setMissing(result.withoutCopy);

        if (result.unavailable > 0 && result.attached === 0) {
          setMessage(
            "Project Gutenberg is not answering right now. Nothing was changed — try again later."
          );
          break;
        }
        if (result.done || result.scanned === 0) break;
      }
    } catch {
      setMessage(
        "The fetch stopped unexpectedly. Copies already attached are safe — press Start to continue."
      );
    } finally {
      setRunning(false);
      setFinished(true);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="card p-5 sm:p-6">
        <SectionHeader
          title="Public-domain editions"
          description="Attaches a free reading copy from Project Gutenberg to catalogue books that have none. Matching uses the Project Gutenberg numbers Open Library already records for each work."
        />

        <div className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="fetch-size"
                className="text-sm font-medium text-foreground"
              >
                Books to check
              </label>
              <select
                id="fetch-size"
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
              <span className="text-sm font-medium text-foreground">
                Catalogue coverage
              </span>
              <p className="mt-2 flex h-10 items-center rounded-lg border border-line bg-surface-2 px-3 text-sm text-muted-strong">
                {withCopy.toLocaleString("en-GB")} of{" "}
                {totalCount.toLocaleString("en-GB")} books have a reading copy
              </p>
            </div>
          </div>

          <p className="rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-muted-strong">
            Books are checked in catalogue order, starting from the oldest entry
            without a digital copy. Anything already attached is skipped, so
            repeated runs keep moving forward.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startRun}
              disabled={running}
              className="btn btn-primary"
            >
              {running ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <CloudDownload size={16} aria-hidden="true" />
              )}
              {running ? "Fetching…" : "Start looking"}
            </button>
            {running && (
              <button
                type="button"
                onClick={() => (cancelled.current = true)}
                className="btn btn-secondary"
              >
                <Square size={14} aria-hidden="true" />
                Stop
              </button>
            )}
            {totals.attached > 0 && !running && (
              <Link href="/" className="btn btn-ghost">
                View catalogue
              </Link>
            )}
          </div>

          {message && (
            <p
              role="alert"
              className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning"
            >
              {message}
            </p>
          )}

          {items.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Latest results
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {items.map((item) => (
                  <ItemRow key={`${item.bookId}-${item.status}`} item={item} />
                ))}
              </ul>
            </div>
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
            aria-label="Public-domain fetch progress"
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
              <dt className="text-xs text-muted">Attached</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {totals.attached}
              </dd>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <dt className="text-xs text-muted">No edition</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {totals.noMatch}
              </dd>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <dt className="text-xs text-muted">Gutenberg down</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {totals.unavailable}
              </dd>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <dt className="text-xs text-muted">Failed</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {totals.failed}
              </dd>
            </div>
          </dl>

          {pending > 0 && (
            <p className="mt-3 text-xs text-muted">
              {pending.toLocaleString("en-GB")} book
              {pending === 1 ? "" : "s"} still to check for a free edition
            </p>
          )}

          {finished && !running && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
              <BookOpenCheck
                size={14}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <span>
                {totals.attached > 0
                  ? `${totals.attached} reading cop${
                      totals.attached === 1 ? "y" : "ies"
                    } attached. Members with an open loan can read them now.`
                  : done === 0
                    ? "Nothing left to check — every book already has a reading copy or was checked before."
                    : "No reading copies were attached in this slice."}
              </span>
            </p>
          )}
        </div>

        <div className="rounded-xl border border-brand-soft-border bg-brand-soft p-4 text-xs text-brand dark:text-foreground">
          <p className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Only works in the public domain have a free edition to attach —
              in practice, titles published before 1929 in the United States.
              Current, in-copyright books need a licence from a library vendor
              and cannot be fetched this way.
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}
