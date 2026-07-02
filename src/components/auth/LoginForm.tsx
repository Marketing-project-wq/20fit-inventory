"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signIn, type ActionState } from "@/lib/actions";
import { inputCls, Field, Alert } from "@/components/forms/ui";

export function LoginForm({ locale, next }: { locale: string; next: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signIn,
    null,
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-lg font-bold text-bg">
            20
          </div>
          <h1 className="mt-3 text-lg font-bold text-fg">20FIT Shop</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>

        <form
          action={action}
          className="space-y-4 rounded-xl border border-border bg-surface p-6"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={next} />

          {state && !state.ok && (
            <Alert tone="danger">
              {state.error === "invalid_credentials"
                ? t("invalidCredentials")
                : state.error === "not_configured"
                  ? t("notConfigured")
                  : t("invalidInput")}
            </Alert>
          )}

          <Field label={t("email")}>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className={inputCls}
            />
          </Field>
          <Field label={t("password")}>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputCls}
            />
          </Field>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? tc("loading") : t("signIn")}
          </button>
        </form>
      </div>
    </div>
  );
}
