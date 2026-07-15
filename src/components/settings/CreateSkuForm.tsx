"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Zap } from "lucide-react";
import { createSku } from "@/lib/settings-actions";
import type { SkuAdmin } from "@/lib/data";
import { generateSkuCode } from "@/lib/sku/generate-sku";
import { cn } from "@/lib/utils";
import { Field, Alert, inputCls } from "@/components/forms/ui";

type Opt = { id: string; name: string };

/**
 * Create a single SKU (product + variant). Shared by Settings → SKUs & Prices
 * and the "+ Tambah SKU" drawer on the Products page. The SKU field is
 * controlled so the ⚡ Generate button can fill it; other fields are uncontrolled
 * and read via FormData on submit.
 */
export function CreateSkuForm({
  categories,
  brands,
  existingSkus,
  onCreated,
}: {
  categories: Opt[];
  brands: Opt[];
  existingSkus: string[];
  onCreated: (row: SkuAdmin) => void;
}) {
  const t = useTranslations("settings");
  const tp = useTranslations("product");
  const tc = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [skuCode, setSkuCode] = useState("");
  const [genNote, setGenNote] = useState<{
    tone: "warning" | "success";
    text: string;
  } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);

  function handleGenerate() {
    const categoryId = categoryRef.current?.value ?? "";
    const productName = nameRef.current?.value.trim() ?? "";
    if (!categoryId) {
      setGenNote({ tone: "warning", text: t("generateNeedCategory") });
      categoryRef.current?.focus();
      return;
    }
    if (!productName) {
      setGenNote({ tone: "warning", text: t("generateNeedName") });
      nameRef.current?.focus();
      return;
    }
    const categoryName = categories.find((c) => c.id === categoryId)?.name ?? "";
    const result = generateSkuCode({ categoryName, productName, existingSkus });
    setSkuCode(result.sku);
    setGenNote(
      result.note
        ? { tone: "warning", text: t(result.note.key, result.note.params) }
        : { tone: "success", text: t("generateReady") },
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      name: String(fd.get("name") ?? ""),
      name_en: String(fd.get("name_en") ?? "") || undefined,
      sku_code: String(fd.get("sku_code") ?? ""),
      category_id: (fd.get("category_id") as string) || null,
      brand_id: (fd.get("brand_id") as string) || null,
      cost_price: String(fd.get("cost_price") ?? ""),
      selling_price: String(fd.get("selling_price") ?? ""),
      reorder_point: String(fd.get("reorder_point") ?? ""),
      unit_of_measure: String(fd.get("unit_of_measure") ?? "") || undefined,
    };
    const form = e.currentTarget;
    start(async () => {
      const res = await createSku(input);
      if (!res.ok) {
        setError(
          res.error === "sku_exists"
            ? t("skuExists")
            : res.error === "invalid_input"
              ? tc("required")
              : (res.error ?? t("genericError")),
        );
        return;
      }
      const catName = categories.find((c) => c.id === input.category_id)?.name ?? null;
      onCreated({
        variant_id: res.id ?? crypto.randomUUID(),
        sku_code: input.sku_code.trim(),
        product_name: input.name.trim(),
        category_name: catName,
        cost_price: input.cost_price ? Number(input.cost_price) : null,
        selling_price: input.selling_price ? Number(input.selling_price) : null,
        reorder_point: input.reorder_point ? Number(input.reorder_point) : null,
        unit_of_measure: input.unit_of_measure ?? "pcs",
        is_active: true,
      });
      form.reset();
      setSkuCode("");
      setGenNote(null);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={tp("productName")}>
          <input ref={nameRef} name="name" required maxLength={300} className={inputCls} />
        </Field>
        <Field label={tp("skuCode")}>
          <div className="flex items-stretch gap-2">
            <input
              name="sku_code"
              required
              maxLength={100}
              value={skuCode}
              onChange={(e) => {
                setSkuCode(e.target.value);
                setGenNote(null);
              }}
              placeholder="20FIT-KB-016"
              className={cn(inputCls, "font-mono")}
            />
            <button
              type="button"
              onClick={handleGenerate}
              title={t("generateTitle")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-xs font-semibold whitespace-nowrap text-fg transition-colors hover:border-accent hover:text-accent"
            >
              <Zap size={14} className="text-accent" />
              {t("generate")}
            </button>
          </div>
          {genNote && (
            <span
              className={cn(
                "mt-1 block text-xs",
                genNote.tone === "warning" ? "text-warning" : "text-success",
              )}
            >
              {genNote.text}
            </span>
          )}
        </Field>
        <Field label={tp("category")}>
          <select ref={categoryRef} name="category_id" defaultValue="" className={inputCls}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tp("brand")}>
          <select name="brand_id" defaultValue="" className={inputCls}>
            <option value="">—</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tp("costPrice")}>
          <input name="cost_price" type="number" min={0} step="any" className={inputCls} />
        </Field>
        <Field label={tp("sellingPrice")}>
          <input name="selling_price" type="number" min={0} step="any" className={inputCls} />
        </Field>
        <Field label={tp("reorderPoint")}>
          <input name="reorder_point" type="number" min={0} className={inputCls} />
        </Field>
        <Field label={t("unit")}>
          <input name="unit_of_measure" placeholder="pcs" maxLength={20} className={inputCls} />
        </Field>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        {t("createSku")}
      </button>
    </form>
  );
}
