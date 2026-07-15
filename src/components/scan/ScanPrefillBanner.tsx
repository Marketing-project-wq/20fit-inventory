"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ScanLine, X } from "lucide-react";

/**
 * Dismissable notice shown at the top of Goods In / Goods Out when the SKU was
 * pre-filled from a QR scan (?variant=…). Purely informational — the form's SKU
 * select is already set.
 */
export function ScanPrefillBanner({ sku }: { sku: string }) {
  const t = useTranslations("scan");
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent-dim/40 px-4 py-3">
      <ScanLine size={18} className="shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-accent">{t("prefilledTitle")}</p>
        <p className="mt-0.5 text-xs text-muted">{t("prefilledHint", { sku })}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Dismiss"
        className="ml-auto shrink-0 text-muted transition-colors hover:text-fg"
      >
        <X size={15} />
      </button>
    </div>
  );
}
