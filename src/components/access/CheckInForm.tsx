"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { LogIn } from "lucide-react";
import { checkInAccess, type ActionState } from "@/lib/actions";
import { Field, Alert, inputCls } from "@/components/forms/ui";

type Loc = { location_id: string; name: string };

export function CheckInForm({ locations }: { locations: Loc[] }) {
  const t = useTranslations("access");
  const tc = useTranslations("common");
  const tf = useTranslations("form");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    checkInAccess,
    null,
  );
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form
      ref={ref}
      action={action}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      {state?.ok && <Alert tone="success">{t("checkedIn")}</Alert>}
      {state && !state.ok && (
        <Alert tone="danger">
          {state.error === "invalid_input" ? tc("required") : state.error}
        </Alert>
      )}

      <Field label={t("visitorName")}>
        <input
          name="visitor_name"
          required
          maxLength={200}
          placeholder={t("visitorPlaceholder")}
          className={inputCls}
        />
      </Field>

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

      <Field label={t("purpose")} hint={t("purposeHint")}>
        <input
          name="purpose"
          maxLength={300}
          placeholder={t("purposePlaceholder")}
          className={inputCls}
        />
      </Field>

      <Field label={tc("notes")} hint={tf("optional")}>
        <input name="notes" maxLength={500} className={inputCls} />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
      >
        <LogIn size={16} />
        {pending ? tc("loading") : t("checkIn")}
      </button>
    </form>
  );
}
