"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload } from "lucide-react";
import ConfirmDialog from "./confirm-dialog";

type EbookInfo = {
  originalName: string;
  byteSize: number;
  source: string | null;
  sourceRef: string | null;
};

type Props = {
  bookId: number;
  title: string;
  ebook: EbookInfo | null;
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return body?.error ?? "Something went wrong. Try again.";
}

export default function BookEbookPanel({ bookId, title, ebook }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  async function upload() {
    if (!selected) return;
    setUploading(true);
    setMessage(null);

    const body = new FormData();
    body.append("file", selected);

    try {
      const response = await fetch(`/api/ebooks/${bookId}`, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        setMessage({ ok: false, text: await readError(response) });
        return;
      }
      const result = (await response.json()) as {
        ebook?: { chapterCount?: number };
      };
      const chapters = result.ebook?.chapterCount;
      setSelected(null);
      if (input.current) input.current.value = "";
      setMessage({
        ok: true,
        text: chapters
          ? `Digital copy uploaded (${chapters} ${
              chapters === 1 ? "chapter" : "chapters"
            }).`
          : "Digital copy uploaded.",
      });
      router.refresh();
    } catch {
      setMessage({
        ok: false,
        text: "The upload failed. Check your connection and try again.",
      });
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    setRemoving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/ebooks/${bookId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setMessage({ ok: false, text: await readError(response) });
        return;
      }
      setConfirming(false);
      setMessage({ ok: true, text: "Digital copy removed." });
      router.refresh();
    } catch {
      setMessage({
        ok: false,
        text: "The digital copy could not be removed. Try again.",
      });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"
            aria-hidden="true"
          >
            <FileText size={15} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Digital copy</p>
            {ebook ? (
              <>
                <p className="truncate text-xs text-muted" title={ebook.originalName}>
                  {ebook.originalName} · {formatBytes(ebook.byteSize)}
                </p>
                {ebook.source === "gutenberg" && (
                  <p className="text-xs text-muted">
                    Public domain copy from Project Gutenberg
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted">
                No EPUB yet — members can read it online once a copy is on loan.
              </p>
            )}
          </div>
        </div>

        {ebook && (
          <span className="badge badge-info">Read online enabled</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept=".epub,application/epub+zip"
          className="sr-only"
          id={`ebook-file-${bookId}`}
          onChange={(event) => {
            setSelected(event.target.files?.[0] ?? null);
            setMessage(null);
          }}
        />
        <label
          htmlFor={`ebook-file-${bookId}`}
          className="btn btn-sm btn-secondary cursor-pointer"
        >
          <Upload size={14} strokeWidth={2.25} aria-hidden="true" />
          {ebook ? "Choose replacement" : "Choose EPUB"}
        </label>

        {selected && (
          <button
            type="button"
            onClick={upload}
            disabled={uploading}
            className="btn btn-sm btn-primary"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                Uploading...
              </>
            ) : (
              "Upload digital copy"
            )}
          </button>
        )}

        {selected && (
          <span className="max-w-full truncate text-xs text-muted">
            {selected.name}
          </span>
        )}

        {ebook && !selected && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn btn-sm btn-secondary"
          >
            Remove
          </button>
        )}
      </div>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mt-2 text-sm ${
            message.ok ? "text-success" : "text-danger"
          }`}
        >
          {message.text}
        </p>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Remove the digital copy of "${title}"?`}
          description="Members with an open loan will no longer be able to read it in the browser. Physical lending is not affected."
          onClose={() => setConfirming(false)}
        >
          <button
            type="button"
            onClick={remove}
            disabled={removing}
            className="btn btn-danger"
          >
            {removing ? "Removing..." : "Remove digital copy"}
          </button>
        </ConfirmDialog>
      )}
    </div>
  );
}
