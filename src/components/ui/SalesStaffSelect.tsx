"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, inputCls } from "@/components/forms/ui";
import { cn } from "@/lib/utils";

type Opt = { staff_id: string; name: string };

/**
 * Shared "Nama Sales / Visitor" picker used by Transfer and Warehouse Access.
 * Emits plain form fields (no client-side DB calls), so it works inside the
 * app's server-action forms:
 *   - `sales_staff_id` = a staff UUID, or the "other" sentinel
 *   - `dw_name`        = the daily-worker name, only when "Other" is chosen
 * The server action (parseSalesSelection) turns that into staff id vs dw name.
 */
export function SalesStaffSelect({
  staff,
  label,
  required = false,
}: {
  staff: Opt[];
  label: string;
  required?: boolean;
}) {
  const t = useTranslations("access");
  const [sel, setSel] = useState("");
  const isOther = sel === "other";

  return (
    <Field label={label}>
      <select
        name="sales_staff_id"
        required={required}
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className={inputCls}
      >
        <option value="">{t("selectSales")}</option>
        {staff.map((s) => (
          <option key={s.staff_id} value={s.staff_id}>
            {s.name}
          </option>
        ))}
        <option value="other">{t("dailyWorker")}</option>
      </select>

      {isOther && (
        <>
          <input
            name="dw_name"
            required={required}
            autoFocus
            maxLength={200}
            placeholder={t("dwNamePlaceholder")}
            className={cn(inputCls, "mt-2 border-warning focus:border-warning")}
          />
          <span className="mt-1 block text-xs text-dim">{t("dwNote")}</span>
        </>
      )}
    </Field>
  );
}
