"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded border px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-900"
    >
      Print report
    </button>
  );
}
