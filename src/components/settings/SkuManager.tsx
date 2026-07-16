"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Loader2, Plus, X } from "lucide-react";
import { updateVariant } from "@/lib/settings-actions";
import type { SkuAdmin } from "@/lib/data";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/forms/ui";
import { CreateSkuForm } from "./CreateSkuForm";
import { BulkImportSku } from "./BulkImportSku";

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
              ? "bg-accent text-white hover:opacity-90"
              : "border border-border text-dim",
            err && "bg-danger text-white",
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
  const router = useRouter();
  const [list, setList] = useState(skus);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // Keep the table in sync when the server data is revalidated (e.g. after a
  // bulk import triggers router.refresh()).
  useEffect(() => setList(skus), [skus]);

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
    <div className="space-y-6">
      <BulkImportSku onImported={() => router.refresh()} />

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
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {showAdd ? <X size={15} /> : <Plus size={15} />}
          {t("addSku")}
        </button>
      </div>

      {showAdd && (
        <CreateSkuForm
          categories={categories}
          brands={brands}
          existingSkus={list.map((s) => s.sku_code)}
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
    </div>
  );
}
