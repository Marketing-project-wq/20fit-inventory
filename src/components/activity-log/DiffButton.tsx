"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, X } from "lucide-react";

type Json = Record<string, unknown> | null;

// Technical fields (IDs, timestamps) that aren't useful in a human diff.
const SKIP_FIELDS = new Set([
  "variant_id",
  "product_id",
  "location_id",
  "related_location_id",
  "movement_id",
  "staff_id",
  "claim_id",
  "session_id",
  "log_id",
  "po_id",
  "po_line_id",
  "brand_id",
  "category_id",
  "stock_level_id",
  "reference_id",
  "created_at",
  "updated_at",
  "performed_at",
  "last_updated_at",
]);

export function DiffButton({ before, after }: { before: Json; after: Json }) {
  const t = useTranslations("activityLog");
  const [open, setOpen] = useState(false);

  const allKeys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ).filter((k) => !SKIP_FIELDS.has(k));

  const changedKeys = allKeys.filter(
    (k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null),
  );

  if (changedKeys.length === 0) return null;

  const cell = (v: unknown) =>
    v === undefined || v === null ? (
      <span className="opacity-40">—</span>
    ) : (
      String(typeof v === "object" ? JSON.stringify(v) : v)
    );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded border border-info/40 bg-info/5 px-2 py-1 text-xs font-medium text-info transition hover:bg-info/10"
      >
        <Eye size={12} />
        {t("viewChanges", { count: changedKeys.length })}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("diffTitle")}
            className="fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface-solid shadow-xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface-solid px-5 py-4">
              <h3 className="text-base font-bold text-fg">{t("diffTitle")}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-3 p-5">
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-muted">
                <span>{t("before")}</span>
                <span>{t("after")}</span>
              </div>
              {changedKeys.map((key) => (
                <div key={key} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted">
                    {key.replace(/_/g, " ").toUpperCase()}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="break-all rounded border border-danger/30 bg-danger/5 px-2 py-1.5 font-mono text-xs text-danger">
                      {cell(before?.[key])}
                    </div>
                    <div className="break-all rounded border border-success/30 bg-success/5 px-2 py-1.5 font-mono text-xs text-success">
                      {cell(after?.[key])}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
