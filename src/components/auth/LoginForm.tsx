"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { signIn, type ActionState } from "@/lib/actions";
import { inputCls, Field, Alert } from "@/components/forms/ui";
import { AuthShell } from "./AuthShell";

export function LoginForm({ locale, next }: { locale: string; next: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signIn,
    null,
  );

  return (
    <AuthShell subtitle={t("subtitle")}>
      <form action={action} className="space-y-4">
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

        <div>
          <Field label={t("password")}>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputCls}
            />
          </Field>
          <div className="mt-1.5 text-right">
            <Link
              href="/lupa-sandi"
              className="text-xs font-medium text-muted transition-colors hover:text-accent"
            >
              {t("forgotPassword")}
            </Link>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? tc("loading") : t("signIn")}
        </button>
      </form>
    </AuthShell>
  );
}
