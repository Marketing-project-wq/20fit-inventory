"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { signUp, type ActionState } from "@/lib/actions";
import { inputCls, Field, Alert } from "@/components/forms/ui";
import { cn } from "@/lib/utils";
import { AuthShell } from "./AuthShell";

export function SignUpForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signUp,
    null,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");

  // On success the account exists but is unverified — send the user to the
  // verification screen to enter the branded code we just emailed.
  const goVerify = state?.ok && state.message === "verify_email";
  useEffect(() => {
    if (goVerify) router.replace(`/verifikasi-email?email=${encodeURIComponent(email)}`);
  }, [goVerify, email, router]);

  if (goVerify) {
    return (
      <AuthShell title={t("signUpTitle")} subtitle={tc("loading")}>
        <div className="py-6" />
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
                  : state.error === "email_invalid"
                    ? t("emailInvalid")
                    : state.error === "already_registered"
                      ? t("alreadyRegistered")
                      : state.error === "rate_limited"
                        ? t("otpRateLimited")
                        : state.error === "email_send_failed"
                          ? t("emailSendFailed")
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
