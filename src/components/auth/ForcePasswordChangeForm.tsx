"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { changePassword, type SettingsState } from "@/lib/settings-actions";
import { inputCls, Field, Alert } from "@/components/forms/ui";
import { AuthShell } from "./AuthShell";

/**
 * First-login forced password change. An admin created this account with a
 * temporary password (must_change_password = true); the middleware parks the
 * user here until they set their own. changePassword clears the flag on success,
 * so we refresh to let the middleware forward them into the app.
 */
export function ForcePasswordChangeForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    changePassword,
    null,
  );

  const done = state?.ok === true;
  useEffect(() => {
    if (done) router.replace("/");
  }, [done, router]);

  if (done) {
    return (
      <AuthShell title={t("forceChangeTitle")}>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 size={22} />
          </span>
          <p className="text-sm text-fg/90">{t("forceChangeDone")}</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("forceChangeTitle")} subtitle={t("forceChangeSubtitle")}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />
        {state && !state.ok && (
          <Alert tone="danger">
            {state.error === "password_short"
              ? t("passwordShort")
              : state.error === "password_mismatch"
                ? t("passwordMismatch")
                : t("forceChangeError")}
          </Alert>
        )}

        <Field label={t("newPassword")} hint={t("passwordHint")}>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            autoFocus
            className={inputCls}
          />
        </Field>
        <Field label={t("confirmPassword")}>
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={inputCls}
          />
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? tc("loading") : t("updatePassword")}
        </button>
      </form>
    </AuthShell>
  );
}
