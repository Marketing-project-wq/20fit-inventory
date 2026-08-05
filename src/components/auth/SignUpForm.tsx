"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { signUp, type ActionState } from "@/lib/actions";
import { inputCls, Field, Alert } from "@/components/forms/ui";
import { cn } from "@/lib/utils";
import { AuthShell } from "./AuthShell";

export function SignUpForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signUp,
    null,
  );
  const [showPassword, setShowPassword] = useState(false);

  // Email verification is on — after a successful sign-up we ask the user to
  // confirm their address before logging in.
  if (state?.ok && state.message === "verify_email") {
    return (
      <AuthShell title={t("signUpTitle")}>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success/15 text-success">
            <MailCheck size={22} />
          </span>
          <p className="text-sm text-fg/90">{t("verifyEmailMessage")}</p>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {t("signIn")}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("signUpTitle")}
      subtitle={t("signUpSubtitle")}
      footer={
        <span>
          {t("haveAccount")}{" "}
          <Link
            href="/login"
            className="font-medium text-accent transition-colors hover:underline"
          >
            {t("signIn")}
          </Link>
        </span>
      }
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />

        {state && !state.ok && (
          <Alert tone="danger">
            {state.error === "password_short"
              ? t("passwordShort")
              : state.error === "not_configured"
                ? t("notConfigured")
                : state.error === "invalid_input"
                  ? t("invalidInput")
                  : state.error === "signup_incomplete"
                    ? t("signupIncomplete")
                    : t("signUpFailed")}
          </Alert>
        )}

        <Field label={t("fullName")}>
          <input
            name="full_name"
            type="text"
            autoComplete="name"
            required
            maxLength={200}
            className={inputCls}
          />
        </Field>

        <Field label={t("nicknameOptional")}>
          <input
            name="nickname"
            type="text"
            autoComplete="nickname"
            maxLength={60}
            className={inputCls}
          />
        </Field>

        <Field label={t("email")}>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={200}
            className={inputCls}
          />
        </Field>

        <Field label={t("password")} hint={t("passwordHint")}>
          <div className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              className={cn(inputCls, "pr-11")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted transition-colors hover:text-fg"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? tc("loading") : t("signUp")}
        </button>
      </form>
    </AuthShell>
  );
}
