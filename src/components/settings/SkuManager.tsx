"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Plus, X } from "lucide-react";
import { createSku, updateVariant } from "@/lib/settings-actions";
import type { SkuAdmin } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Field, Alert, inputCls } from "@/components/forms/ui";

type Opt = { id: string; name: string };

const numCls = cn(inputCls, "w-28 py-1.5 text-right font-mono");

function SkuRow({ sku }: { sku: SkuAdmin }) {
  const t = useTranslations("settings");
  const [cost, setCost] = useState(sku.cost_price?.toString() ?? "");
  const [sell, setSell] = useState(sku.selling_price?.toString() ?? "");
  const [reorder, setReorder] = useState(sku.reorder_point?.toString() ?? "");
  const [active, setActive] = useState(sku.is_active);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  const dirty =
    cost !== (sku.cost_price?.toString() ?? "") ||
    sell !== (sku.selling_price?.toString() ?? "") ||
    reorder !== (sku.reorder_point?.toString() ?? "") ||
    active !== sku.is_active;

  function save() {
    setErr(false);
    start(async () => {
      const res = await updateVariant({
        variant_id: sku.variant_id,
        cost_price: cost,
        selling_price: sell,
        reorder_point: reorder,
        is_active: active,
      });
      if (!res.ok) {
        setErr(true);
        return;
      }
      // rebaseline so the row is no longer "dirty"
      sku.cost_price = cost === "" ? null : Number(cost);
      sku.selling_price = sell === "" ? null : Number(sell);
      sku.reorder_point = reorder === "" ? null : Number(reorder);
      sku.is_active = active;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <tr className={cn("border-t border-border", !active && "opacity-55")}>
      <td className="px-3 py-2">
        <span className="sku text-xs">{sku.sku_code}</span>
      </td>
      <td className="px-3 py-2 text-fg">
        {sku.product_name}
        {sku.category_name && (
          <span className="ml-2 text-xs text-dim">{sku.category_name}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          type="number"
          min={0}
          step="any"
          className={numCls}
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={sell}
          onChange={(e) => setSell(e.target.value)}
          type="number"
          min={0}
          step="any"
          className={numCls}
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={reorder}
          onChange={(e) => setReorder(e.target.value)}
          type="number"
          min={0}
          className={cn(inputCls, "w-20 py-1.5 text-right font-mono")}
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={save}
          disabled={!dirty || pending}
          className={cn(
            "inline-flex h-8 w-16 items-center justify-center gap-1 rounded-lg text-xs font-semibold transition-colors",
            dirty
              ? "bg-accent text-bg hover:opacity-90"
              : "border border-border text-dim",
            err && "bg-danger text-bg",
          )}
        >
          {pending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : saved ? (
            <Check size={14} />
          ) : (
            t("save")
          )}
        </button>
      </td>
    </tr>
  );
}

export function SkuManager({
  skus,
  categories,
  brands,
}: {
  skus: SkuAdmin[];
  categories: Opt[];
  brands: Opt[];
}) {
  const t = useTranslations("settings");
  const tp = useTranslations("product");
  const tc = useTranslations("common");
  const [list, setList] = useState(skus);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (s) =>
        s.product_name.toLowerCase().includes(needle) ||
        s.sku_code.toLowerCase().includes(needle),
    );
  }, [list, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tc("search")}
          className={cn(inputCls, "max-w-xs")}
        />
        <span className="text-xs text-muted">
          {t("skuCount", { count: filtered.length })}
        </span>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
        >
          {showAdd ? <X size={15} /> : <Plus size={15} />}
          {t("addSku")}
        </button>
      </div>

      {showAdd && (
        <AddSkuForm
          categories={categories}
          brands={brands}
          onCreated={(row) => {
            setList((prev) => [row, ...prev]);
            setShowAdd(false);
          }}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{tp("skuCode")}</th>
              <th className="px-3 py-2 font-medium">{tp("productName")}</th>
              <th className="px-3 py-2 font-medium">{tp("costPrice")}</th>
              <th className="px-3 py-2 font-medium">{tp("sellingPrice")}</th>
              <th className="px-3 py-2 font-medium">{tp("reorderPoint")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("active")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <SkuRow key={s.variant_id} sku={s} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted">{tc("noData")}</div>
        )}
      </div>
    </div>
  );
}

function AddSkuForm({
  categories,
  brands,
  onCreated,
}: {
  categories: Opt[];
  brands: Opt[];
  onCreated: (row: SkuAdmin) => void;
}) {
  const t = useTranslations("settings");
  const tp = useTranslations("product");
  const tc = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
      const catName =
        categories.find((c) => c.id === input.category_id)?.name ?? null;
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
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={tp("productName")}>
          <input name="name" required maxLength={300} className={inputCls} />
        </Field>
        <Field label={tp("skuCode")}>
          <input name="sku_code" required maxLength={100} className={inputCls} />
        </Field>
        <Field label={tp("category")}>
          <select name="category_id" defaultValue="" className={inputCls}>
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
