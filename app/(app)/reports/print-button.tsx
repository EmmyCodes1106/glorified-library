"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn btn-secondary"
    >
      <Printer size={15} aria-hidden="true" />
      Print report
    </button>
  );
}
