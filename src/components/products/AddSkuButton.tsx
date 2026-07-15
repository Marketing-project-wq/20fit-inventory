"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { CreateSkuForm } from "@/components/settings/CreateSkuForm";

type Opt = { id: string; name: string };

/**
 * "+ Tambah SKU" shortcut on the Products page. Opens a slide-in drawer that
 * reuses the same Create-SKU form as Settings — no navigation. On success it
 * refreshes the server data so the new SKU appears in the table.
 */
export function AddSkuButton({
  categories,
  brands,
  existingSkus,
}: {
  categories: Opt[];
  brands: Opt[];
  existingSkus: string[];
}) {
  const t = useTranslations("product");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
      >
        <Plus size={16} />
        <span className="hidden sm:inline">{t("addSku")}</span>
        <span className="sm:hidden">{t("quickAdd")}</span>
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
            aria-label={t("addSkuNew")}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-border bg-surface-solid shadow-xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface-solid px-5 py-4">
              <h2 className="text-base font-bold text-fg">{t("addSkuNew")}</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <CreateSkuForm
                categories={categories}
                brands={brands}
                existingSkus={existingSkus}
                onCreated={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
