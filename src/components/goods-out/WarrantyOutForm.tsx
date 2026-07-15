"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { recordWarrantyOut, type ActionState } from "@/lib/actions";
import { WARRANTY_OUT_REASONS } from "@/lib/inventory/constants";
import { Field, Alert, inputCls } from "@/components/forms/ui";
import { ItemPhotoField } from "@/components/goods-in/ItemPhotoField";

type Opt = { variant_id: string; sku_code: string; product_name: string };
type Loc = { location_id: string; name: string };
export type StockByLoc = {
  variant_id: string;
  location_id: string;
  good: number;
  damaged: number;
};

export function WarrantyOutForm({
  skus,
  locations,
  stockByLoc,
  preselectVariantId,
}: {
  skus: Opt[];
  locations: Loc[];
  stockByLoc: StockByLoc[];
  preselectVariantId?: string;
}) {
  const t = useTranslations("goodsOut");
  const tf = useTranslations("form");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recordWarrantyOut,
    null,
  );
  const ref = useRef<HTMLFormElement>(null);
  const [variantId, setVariantId] = useState(preselectVariantId ?? "");
  const [locationId, setLocationId] = useState(locations[0]?.location_id ?? "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  // Warranty ships DAMAGED stock only — look up how much is available.
  const damagedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of stockByLoc) m.set(`${r.variant_id}:${r.location_id}`, r.damaged);
    return m;
  }, [stockByLoc]);
  const available =
    variantId && locationId ? (damagedMap.get(`${variantId}:${locationId}`) ?? 0) : 0;

  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setVariantId("");
      setLocationId(locations[0]?.location_id ?? "");
      setQuantity("");
      setReason("");
    }
  }, [state, locations]);

  const qty = parseInt(quantity, 10);
  const qtyValid = qty > 0 && qty <= available;
  const overMax = quantity !== "" && qty > available;

  return (
    <form
      ref={ref}
      action={action}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      {state?.ok && (
        <Alert tone="success">
          {t("warrantySavedClaim", { claim: state.message ?? "" })}
        </Alert>
      )}
      {state && !state.ok && (
        <Alert tone="danger">
          {state.error === "insufficient_damaged_stock"
            ? t("noDamagedStock")
            : state.error === "photo_too_large"
              ? tf("invalidInput")
              : tf("invalidInput")}
        </Alert>
      )}

      {/* Reminder: warranty draws from the damaged pool, not sellable stock. */}
      <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/5 p-3 text-xs text-info">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span>{t("warrantyInfoBanner")}</span>
      </div>

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
        <Field label={t("shipQuantity")}>
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

      {/* Damaged stock indicator */}
      {variantId && locationId && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            available > 0
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {t("damagedStockAvailable", { count: available })}
          {available === 0 && <span className="ml-1">— {t("noDamagedStock")}</span>}
        </div>
      )}
      {overMax && available > 0 && (
        <p className="text-xs text-danger">{t("exceedsDamaged", { max: available })}</p>
      )}

      <Field label={t("shipmentPurpose")}>
        <select
          name="reason_code"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={inputCls}
        >
          <option value="" disabled>
            —
          </option>
          {WARRANTY_OUT_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`reason_${r}`)}
            </option>
          ))}
        </select>
      </Field>
      {reason === "other" && (
        <Field label={t("reasonOtherLabel")}>
          <input name="reason_other" required maxLength={200} className={inputCls} autoFocus />
        </Field>
      )}

      <Field label={t("supplierName")}>
        <input
          name="supplier_name"
          required
          maxLength={200}
          placeholder={t("supplierPlaceholder")}
          className={inputCls}
        />
      </Field>

      <Field label={t("claimNumber")} hint={t("claimNumberHint")}>
        <input
          name="claim_number"
          maxLength={120}
          placeholder={t("claimNumberPlaceholder")}
          className={`${inputCls} font-mono`}
        />
      </Field>

      <Field label={tc("notes")} hint={tf("optional")}>
        <input name="notes" maxLength={500} className={inputCls} />
      </Field>

      <div>
        <ItemPhotoField label={t("photoBeforeSend")} />
        <p className="mt-1 text-xs text-dim">{t("photoBeforeSendHint")}</p>
      </div>

      <button
        type="submit"
        disabled={pending || !variantId || available === 0 || !qtyValid}
        className="w-full rounded-lg bg-info px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? tc("loading") : t("sendForWarranty")}
      </button>
    </form>
  );
}
