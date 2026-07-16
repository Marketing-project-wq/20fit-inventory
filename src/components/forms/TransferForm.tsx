"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, X } from "lucide-react";
import { recordTransfer, type ActionState } from "@/lib/actions";
import { SalesStaffSelect } from "@/components/ui/SalesStaffSelect";
import { Field, Alert, inputCls } from "./ui";

type Opt = { variant_id: string; sku_code: string; product_name: string };
type Loc = { location_id: string; name: string };
type Sales = { staff_id: string; name: string };

export function TransferForm({
  skus,
  locations,
  salesStaff,
}: {
  skus: Opt[];
  locations: Loc[];
  salesStaff: Sales[];
}) {
  const t = useTranslations("form");
  const tc = useTranslations("common");
  const tt = useTranslations("transfer");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recordTransfer,
    null,
  );
  const ref = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setPreview(null);
    }
  }, [state]);

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
            : state.error === "same_location"
              ? t("sameLocation")
              : state.error === "photo_too_large"
                ? tt("photoTooLarge")
                : state.error === "photo_upload_failed"
                  ? tt("photoUploadFailed")
                  : state.error === "not_configured"
                    ? t("notConfigured")
                    : t("invalidInput")}
        </Alert>
      )}

      <Field label={t("sku")}>
        <select name="variant_id" required defaultValue="" className={inputCls}>
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
        <Field label={t("fromLocation")}>
          <select
            name="from_location_id"
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
        <Field label={t("toLocation")}>
          <select
            name="to_location_id"
            required
            defaultValue={locations[1]?.location_id ?? ""}
            className={inputCls}
          >
            {locations.map((l) => (
              <option key={l.location_id} value={l.location_id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={tc("quantity")}>
          <input name="quantity" type="number" min={1} required className={inputCls} />
        </Field>
        <Field label={tc("notes")} hint={t("optional")}>
          <input name="notes" type="text" className={inputCls} />
        </Field>
      </div>

      <SalesStaffSelect staff={salesStaff} label={tt("salesPerson")} />

      {/* Proof photo (optional) */}
      <div>
        <span className="mb-1 block text-xs font-medium text-muted">
          {tt("proofPhotoOptional")}
        </span>
        <label
          htmlFor="transfer-photo"
          className="flex min-h-[80px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface-2 p-3 transition-colors hover:border-accent"
        >
          {preview ? (
            <div className="relative w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={tt("proofPhoto")}
                className="max-h-48 w-full rounded object-cover"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setPreview(null);
                  if (ref.current) {
                    const input = ref.current.elements.namedItem(
                      "photo",
                    ) as HTMLInputElement | null;
                    if (input) input.value = "";
                  }
                }}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label={tc("cancel")}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <Camera size={22} className="text-muted" />
              <span className="text-xs font-medium text-muted">
                {tt("takeOrChoosePhoto")}
              </span>
              <span className="text-xs text-dim">{tt("photoMaxSize")}</span>
            </>
          )}
          <input
            id="transfer-photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) {
                setPreview(null);
                return;
              }
              if (file.size > 5 * 1024 * 1024) {
                alert(tt("photoTooLarge"));
                e.target.value = "";
                setPreview(null);
                return;
              }
              setPreview(URL.createObjectURL(file));
            }}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? tc("loading") : t("submitTransfer")}
      </button>
    </form>
  );
}
