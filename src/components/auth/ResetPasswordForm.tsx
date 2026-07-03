"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { updatePassword, type ActionState } from "@/lib/actions";
import { inputCls, Field, Alert } from "@/components/forms/ui";
import { AuthShell } from "./AuthShell";

export function ResetPasswordForm({
  locale,
  hasSession,
  linkError,
}: {
  locale: string;
  hasSession: boolean;
  linkError: boolean;
}) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updatePassword,
    null,
  );

  const done = state?.ok && state.message === "password_updated";

  // No valid recovery session (link expired, opened in a different browser, or
  // visited directly) — steer the user back to request a fresh link.
  if (!done && (!hasSession || linkError)) {
    return (
      <AuthShell title={t("resetTitle")}>
        <div className="space-y-4">
          <Alert tone="danger">
            {linkError ? t("resetError") : t("resetSessionMissing")}
          </Alert>
          <Link
            href="/lupa-sandi"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90"
          >
            {t("forgotTitle")}
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title={t("resetTitle")}>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 size={22} />
          </span>
          <p className="text-sm text-fg/90">{t("passwordUpdated")}</p>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90"
          >
            {t("signIn")}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("resetTitle")}
      subtitle={t("resetSubtitle")}
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
      <form action={action} className="space-y-4">
        {state && !state.ok && (
          <Alert tone="danger">
            {state.error === "password_short"
              ? t("passwordShort")
              : state.error === "password_mismatch"
                ? t("passwordMismatch")
                : state.error === "session_missing"
                  ? t("resetSessionMissing")
                  : t("invalidInput")}
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
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? tc("loading") : t("updatePassword")}
        </button>
      </form>
    </AuthShell>
  );
}
