"use client";

import { Field, inputCls } from "@/components/forms/ui";

/**
 * "Nama Sales / Penanggung Jawab" input. Replaces the retired sales-staff
 * picklist: a plain text field pre-filled with the logged-in user's display
 * name (nickname > full_name > email) and freely editable — clear it and type a
 * different name (e.g. a daily worker). Posts the name directly as `dw_name`.
 */
export function ResponsiblePersonField({
  defaultName,
  label,
  hint,
  required = false,
}: {
  defaultName: string;
  label: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        name="dw_name"
        type="text"
        defaultValue={defaultName}
        required={required}
        maxLength={200}
        className={inputCls}
      />
    </Field>
  );
}
