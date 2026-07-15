"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { recordConditionOut, type ActionState } from "@/lib/actions";
import { Field, Alert, inputCls } from "@/components/forms/ui";
import type { StockByLoc } from "./WarrantyOutForm";

type Opt = { variant_id: string; sku_code: string; product_name: string };
type Loc = { location_id: string; name: string };

/**
 * Disposal (damage_out, from the damaged pool) and return-to-supplier
 * (return_out, from the good pool). Both route through recordConditionOut;
 * `kind` picks the movement type + stock pool, and the pool drives the
 * availability indicator + max quantity.
 */
export function SimpleGoodsOutForm({
  kind,
  skus,
  locations,
  stockByLoc,
}: {
  kind: "disposal" | "return_supplier";
  skus: Opt[];
  locations: Loc[];
  stockByLoc: StockByLoc[];
}) {
  const t = useTranslations("goodsOut");
  const tf = useTranslations("form");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recordConditionOut,
    null,
  );
  const ref = useRef<HTMLFormElement>(null);
  const [variantId, setVariantId] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.location_id ?? "");
  const [quantity, setQuantity] = useState("");

  const fromDamaged = kind === "disposal";
  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of stockByLoc)
      m.set(`${r.variant_id}:${r.location_id}`, fromDamaged ? r.damaged : r.good);
    return m;
  }, [stockByLoc, fromDamaged]);
  const available =
    variantId && locationId ? (stockMap.get(`${variantId}:${locationId}`) ?? 0) : 0;

  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setVariantId("");
      setLocationId(locations[0]?.location_id ?? "");
      setQuantity("");
    }
  }, [state, locations]);

  const qty = parseInt(quantity, 10);
  const qtyValid = qty > 0 && qty <= available;
  const overMax = quantity !== "" && qty > available;
  const accent = fromDamaged ? "bg-danger" : "bg-warning";

  return (
    <form
      ref={ref}
      action={action}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <input type="hidden" name="kind" value={kind} />

      {state?.ok && <Alert tone="success">{tf("saved")}</Alert>}
      {state && !state.ok && (
        <Alert tone="danger">
          {state.error === "insufficient_stock"
            ? tf("insufficientStock")
            : tf("invalidInput")}
        </Alert>
      )}

      <p className="text-xs text-muted">
        {fromDamaged ? t("type_disposalDesc") : t("type_returnSupplierDesc")}
      </p>

      <Field label={tf("sku")}>
        <select
          name="variant_id"
          required
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          className={inputCls}
        >
          <option value="" disabled>
            {tf("selectSku")}
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
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
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
          <input
            name="quantity"
            type="number"
            min={1}
            max={available || undefined}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={available === 0}
            className={inputCls}
          />
        </Field>
      </div>

      {variantId && locationId && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            available > 0
              ? fromDamaged
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-success/40 bg-success/10 text-success"
              : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {fromDamaged
            ? t("damagedStockAvailable", { count: available })
            : t("goodStockAvailable", { count: available })}
        </div>
      )}
      {overMax && available > 0 && (
        <p className="text-xs text-danger">{t("exceedsStock", { max: available })}</p>
      )}

      <Field label={tc("notes")} hint={tf("optional")}>
        <input name="notes" maxLength={500} className={inputCls} />
      </Field>

      <Field label={t("referenceNumber")} hint={tf("optional")}>
        <input name="reference_number" maxLength={120} className={`${inputCls} font-mono`} />
      </Field>

      <button
        type="submit"
        disabled={pending || !variantId || available === 0 || !qtyValid}
        className={`w-full rounded-lg ${accent} px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50`}
      >
        {pending
          ? tc("loading")
          : fromDamaged
            ? t("saveDisposal")
            : t("saveReturnSupplier")}
      </button>
    </form>
  );
}
