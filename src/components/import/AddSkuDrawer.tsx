"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, X, Loader2 } from "lucide-react";
import { CreateSkuForm } from "@/components/settings/CreateSkuForm";
import { loadSkuFormOptions, type SkuFormOptions } from "@/lib/settings-actions";

export type CreatedSku = {
  variant_id: string;
  sku_code: string;
  product_name: string;
};

/**
 * Inline shortcut to create a SKU from an import review screen when a row has
 * no matching SKU yet. Opens a slide-in drawer reusing CreateSkuForm; category
 * and brand options are lazy-loaded on open, so hosting panels only pass the
 * existing SKU codes (for the ⚡ Generate helper) and a suggested name.
 */
export function AddSkuDrawer({
  existingSkus,
  defaultName,
  onCreated,
  compact = false,
}: {
  existingSkus: string[];
  defaultName?: string;
  onCreated: (sku: CreatedSku) => void;
  compact?: boolean;
}) {
  const tp = useTranslations("product");
  const ti = useTranslations("import");
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<SkuFormOptions | null>(null);
  const [loading, start] = useTransition();

  function openDrawer() {
    setOpen(true);
    if (!opts) start(async () => setOpts(await loadSkuFormOptions()));
  }

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className={
          compact
            ? "inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs font-medium text-fg transition-colors hover:border-accent hover:text-accent"
            : "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-accent"
        }
      >
        <Plus size={compact ? 13 : 15} />
        {tp("addSku")}
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
            aria-label={tp("addSkuNew")}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl overflow-y-auto border-l border-border bg-surface-solid shadow-xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface-solid px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-fg">{tp("addSkuNew")}</h2>
                <p className="mt-0.5 text-xs text-muted">{ti("addSkuFromRow")}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              {loading || !opts ? (
                <div className="flex items-center gap-2 py-10 text-sm text-muted">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              ) : (
                <CreateSkuForm
                  categories={opts.categories}
                  brands={opts.brands}
                  existingSkus={existingSkus}
                  defaultName={defaultName}
                  onCreated={(row) => {
                    onCreated({
                      variant_id: row.variant_id,
                      sku_code: row.sku_code,
                      product_name: row.product_name,
                    });
                    setOpen(false);
                  }}
                />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
