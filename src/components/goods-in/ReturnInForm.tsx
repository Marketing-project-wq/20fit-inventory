"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { recordReturnIn, type ActionState } from "@/lib/actions";
import { RETURN_REASONS, type ItemCondition } from "@/lib/inventory/constants";
import { Field, Alert, inputCls } from "@/components/forms/ui";
import { ConditionToggle } from "./ConditionToggle";
import { ItemPhotoField } from "./ItemPhotoField";

type Opt = { variant_id: string; sku_code: string; product_name: string };
type Loc = { location_id: string; name: string };

export function ReturnInForm({ skus, locations }: { skus: Opt[]; locations: Loc[] }) {
  const t = useTranslations("goodsIn");
  const tf = useTranslations("form");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recordReturnIn,
    null,
  );
  const ref = useRef<HTMLFormElement>(null);
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState<ItemCondition>("good");

  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setReason("");
      setCondition("good");
    }
  }, [state]);

  const damaged = condition === "damaged";

  return (
    <form
      ref={ref}
      action={action}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      {state?.ok && <Alert tone="success">{tf("saved")}</Alert>}
      {state && !state.ok && (
        <Alert tone="danger">
          {state.error === "photo_required"
            ? t("photoRequired")
            : state.error === "notes_required"
              ? t("notesRequired")
              : state.error === "photo_too_large"
                ? t("photoTooLarge")
                : state.error === "insufficient_stock"
                  ? tf("insufficientStock")
                  : tf("invalidInput")}
        </Alert>
      )}
      <input type="hidden" name="item_condition" value={condition} />

      <Field label={t("returnedSku")}>
        <select name="variant_id" required defaultValue="" className={inputCls}>
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
        <Field label={t("returnQty")}>
          <input name="quantity" type="number" min={1} required className={inputCls} />
        </Field>
      </div>

      <Field label={t("returnReason")}>
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
          {RETURN_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`reason_${r}`)}
            </option>
          ))}
        </select>
      </Field>
      {reason === "other" && (
        <Field label={t("reasonOtherLabel")}>
          <input
            name="reason_other"
            required
            maxLength={200}
            className={inputCls}
            autoFocus
          />
        </Field>
      )}

      <ConditionToggle value={condition} onChange={setCondition} />

      {damaged ? (
        <div className="space-y-3 rounded-lg border border-danger/25 bg-danger/5 p-4">
          <p className="text-xs font-semibold text-danger">⚠ {t("photoRequired")}</p>
          <ItemPhotoField required danger />
          <Field label={t("damageDescription")}>
            <textarea
              name="notes"
              required
              rows={3}
              maxLength={500}
              className={`${inputCls} resize-none`}
            />
          </Field>
        </div>
      ) : (
        <Field label={tc("notes")} hint={tf("optional")}>
          <input name="notes" maxLength={500} className={inputCls} />
        </Field>
      )}

      <Field label={t("referenceNumber")} hint={tf("optional")}>
        <input name="reference_number" maxLength={120} className={`${inputCls} font-mono`} />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? tc("loading") : t("saveReturn")}
      </button>
    </form>
  );
}
