"use client";

import Papa from "papaparse";
import { Download } from "lucide-react";

export function ExportCsvButton({
  rows,
  filename,
  label,
}: {
  rows: Record<string, unknown>[];
  filename: string;
  label: string;
}) {
  const onClick = () => {
    const csv = Papa.unparse(rows);
    // Prepend BOM so Excel reads UTF-8 correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={onClick}
      disabled={rows.length === 0}
      className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:border-accent hover:text-fg disabled:opacity-40"
    >
      <Download size={15} /> {label}
    </button>
  );
}
