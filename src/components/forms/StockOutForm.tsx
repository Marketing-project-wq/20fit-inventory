"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { recordStockOut, type ActionState } from "@/lib/actions";
import { Field, Alert, inputCls } from "./ui";

type Opt = { variant_id: string; sku_code: string; product_name: string };
type Loc = { location_id: string; name: string };

export function StockOutForm({
  skus,
  locations,
  preselectVariantId,
}: {
  skus: Opt[];
  locations: Loc[];
  preselectVariantId?: string;
}) {
  const t = useTranslations("form");
  const tc = useTranslations("common");
  const ts = useTranslations("stock");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recordStockOut,
    null,
  );
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  const channels: { v: string; label: string }[] = [
    { v: "offline", label: ts("offline") },
    { v: "tokopedia", label: "Tokopedia" },
    { v: "shopee", label: "Shopee" },
    { v: "b2b_direct", label: "B2B" },
    { v: "other", label: t("otherChannel") },
  ];

  return (
    <form
      ref={ref}
      action={action}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      {state?.ok && <Alert tone="success">{t("saved")}</Alert>}
      {state && !state.ok && (
        <Alert tone="danger">
          {state.error === "insufficient_stock"
            ? t("insufficientStock")
            : state.error === "not_configured"
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
          defaultValue={preselectVariantId ?? ""}
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
          <input
            name="quantity"
            type="number"
            min={1}
            required
            autoFocus={Boolean(preselectVariantId)}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={tc("channel")}>
          <select name="sales_channel" required defaultValue="offline" className={inputCls}>
            {channels.map((c) => (
              <option key={c.v} value={c.v}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("marketplaceOrder")} hint={t("marketplaceHint")}>
          <input name="marketplace_order_number" type="text" className={inputCls} />
        </Field>
      </div>

      <Field label={t("customer")} hint={t("optional")}>
        <input name="customer" type="text" className={inputCls} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-muted">
        <input name="allow_backorder" type="checkbox" className="accent-[var(--color-accent)]" />
        {t("allowBackorder")}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? tc("loading") : t("submitOut")}
      </button>
    </form>
  );
}
