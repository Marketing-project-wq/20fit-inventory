"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { signIn, type ActionState } from "@/lib/actions";
import { inputCls, Field, Alert } from "@/components/forms/ui";
import { cn } from "@/lib/utils";
import { AuthShell } from "./AuthShell";

export function LoginForm({ locale, next }: { locale: string; next: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signIn,
    null,
  );
  const [showPassword, setShowPassword] = useState(false);

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
            <div className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className={cn(inputCls, "pr-11")}
              />
              {/* type="button" so tapping the eye toggles visibility instead of
                  submitting the form. */}
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
