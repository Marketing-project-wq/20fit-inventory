"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Mail, KeyRound, Users, Info } from "lucide-react";
import { changePassword, type SettingsState } from "@/lib/settings-actions";
import type { StaffRole } from "@/lib/data";
import { Field, Alert, inputCls } from "@/components/forms/ui";

export function AccountPanel({
  email,
  role,
}: {
  email: string;
  role: StaffRole | null;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    changePassword,
    null,
  );

  return (
    <div className="max-w-md space-y-6">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
            <Mail className="text-accent" size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-xs text-muted">{t("signedInAs")}</div>
            <div className="truncate font-medium text-fg">{email || "—"}</div>
          </div>
          {role && (
            <span className="ml-auto shrink-0 rounded-full bg-accent-dim px-2.5 py-1 text-xs font-medium text-accent">
              {t(`role_${role}`)}
            </span>
          )}
        </div>
      </div>

      <form
        action={action}
        className="space-y-4 rounded-xl border border-border bg-surface p-5"
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <KeyRound size={15} className="text-accent" />
          {t("changePassword")}
        </h3>

        {state?.ok && <Alert tone="success">{t("passwordChanged")}</Alert>}
        {state && !state.ok && (
          <Alert tone="danger">
            {state.error === "password_short"
              ? t("passwordShort")
              : state.error === "password_mismatch"
                ? t("passwordMismatch")
                : t("genericError")}
          </Alert>
        )}

        <Field label={t("newPassword")} hint={t("passwordHint")}>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputCls}
          />
        </Field>
        <Field label={t("confirmPassword")}>
          <input
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputCls}
          />
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? tc("loading") : t("changePassword")}
        </button>
      </form>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
        <Users className="mt-0.5 shrink-0 text-accent" size={18} />
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
            {t("teamTitle")}
          </p>
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <Info size={13} className="mt-0.5 shrink-0" />
            {t("teamNote")}
          </p>
        </div>
      </div>
    </div>
  );
}
