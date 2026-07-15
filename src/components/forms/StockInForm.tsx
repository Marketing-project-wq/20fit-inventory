"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { recordStockIn, type ActionState } from "@/lib/actions";
import { Field, Alert, inputCls } from "./ui";

type Opt = {
  variant_id: string;
  sku_code: string;
  product_name: string;
  cost_price?: number | null;
};
type Loc = { location_id: string; name: string };

export function StockInForm({ skus, locations }: { skus: Opt[]; locations: Loc[] }) {
  const t = useTranslations("form");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recordStockIn,
    null,
  );
  const ref = useRef<HTMLFormElement>(null);

  // SKU + cost are controlled so we can auto-fill the cost from the master
  // cost_price when a SKU is picked (still editable — an override).
  const [variantId, setVariantId] = useState("");
  const [unitCost, setUnitCost] = useState("");

  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setVariantId("");
      setUnitCost("");
    }
  }, [state]);

  const autoFill = useMemo(() => {
    const sku = skus.find((s) => s.variant_id === variantId);
    return sku?.cost_price ?? null;
  }, [skus, variantId]);

  function onSkuChange(id: string) {
    setVariantId(id);
    const sku = skus.find((s) => s.variant_id === id);
    setUnitCost(sku?.cost_price != null ? String(sku.cost_price) : "");
  }

  const numCost = unitCost === "" ? null : Number(unitCost);
  const costHint =
    autoFill != null && numCost === autoFill
      ? { tone: "text-success", text: t("costAutoFilled") }
      : autoFill != null && numCost != null && numCost !== autoFill
        ? { tone: "text-warning", text: t("costOverride") }
        : variantId && autoFill == null
          ? { tone: "text-dim", text: t("costNoPrice") }
          : null;

  return (
    <form
      ref={ref}
      action={action}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      {state?.ok && <Alert tone="success">{t("saved")}</Alert>}
      {state && !state.ok && (
        <Alert tone="danger">
          {state.error === "not_configured"
            ? t("notConfigured")
            : state.error === "invalid_input"
              ? t("invalidInput")
              : state.error}
        </Alert>
      )}

      <Field label={t("sku")}>
        <select
          name="variant_id"
          required
          value={variantId}
          onChange={(e) => onSkuChange(e.target.value)}
          className={inputCls}
        >
          <option value="" disabled>
            {t("selectSku")}
          </option>
          {skus.map((s) => (
            <option key={s.variant_id} value={s.variant_id}>
              {s.sku_code} — {s.product_name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={tc("location")}>
          <select
            name="location_id"
            required
            defaultValue={locations[0]?.location_id ?? ""}
            className={inputCls}
          >
            {locations.map((l) => (
              <option key={l.location_id} value={l.location_id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tc("quantity")}>
          <input name="quantity" type="number" min={1} required className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Field label={t("unitCost")} hint={t("optional")}>
            <input
              name="unit_cost"
              type="number"
              min={0}
              step="any"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className={inputCls}
            />
          </Field>
          {costHint && (
            <span className={`mt-1 flex items-center gap-1 text-xs ${costHint.tone}`}>
              {costHint.tone === "text-success" && <Sparkles size={12} />}
              {costHint.text}
            </span>
          )}
        </div>
        <Field label={tc("notes")} hint={t("optional")}>
          <input name="notes" type="text" className={inputCls} />
        </Field>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? tc("loading") : t("submitIn")}
      </button>
    </form>
  );
}
