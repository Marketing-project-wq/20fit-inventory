"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requestPasswordReset, type ActionState } from "@/lib/actions";
import { inputCls, Field, Alert } from "@/components/forms/ui";
import { AuthShell } from "./AuthShell";

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    requestPasswordReset,
    null,
  );

  const sent = state?.ok && state.message === "reset_sent";

  return (
    <AuthShell
      title={t("forgotTitle")}
      subtitle={sent ? undefined : t("forgotSubtitle")}
      footer={
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-accent"
        >
          <ArrowLeft size={14} />
          {t("backToLogin")}
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success/15 text-success">
            <MailCheck size={22} />
          </span>
          <p className="text-sm text-fg/90">{t("resetLinkSent")}</p>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />

          {state && !state.ok && (
            <Alert tone="danger">
              {state.error === "email_invalid"
                ? t("emailInvalid")
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
              autoFocus
              className={inputCls}
            />
          </Field>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? tc("loading") : t("sendResetLink")}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
