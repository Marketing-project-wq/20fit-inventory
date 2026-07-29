"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  requestPasswordOtp,
  verifyPasswordOtp,
  type OtpState,
} from "@/lib/otp-actions";
import { inputCls, Field, Alert } from "@/components/forms/ui";
import { cn } from "@/lib/utils";
import { AuthShell } from "./AuthShell";

type Step = "request" | "verify" | "done";

/**
 * Password reset via a 6-digit email OTP. Three steps in one screen:
 * request the code → enter code + new password → done. Replaces the Supabase
 * magic-link recovery flow so the email is fully 20FIT Shop branded.
 */
export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [resent, setResent] = useState(false);
  const [state, setState] = useState<OtpState>(null);
  const [pending, start] = useTransition();
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  function errorText(): string | null {
    if (!state || state.ok || !state.error) return null;
    switch (state.error) {
      case "email_invalid":
        return t("emailInvalid");
      case "not_configured":
        return t("notConfigured");
      case "rate_limited":
        return t("otpRateLimited");
      case "otp_expired":
      case "user_not_found":
        return t("otpExpired");
      case "otp_too_many":
        return t("otpTooMany");
      case "otp_wrong":
        return t("otpWrong", { count: state.attemptsLeft ?? 0 });
      case "otp_invalid":
        return t("otpInvalidFormat");
      case "password_short":
        return t("passwordShort");
      case "password_mismatch":
        return t("passwordMismatch");
      case "update_failed":
        return t("updateFailed");
      default:
        return t("invalidInput");
    }
  }

  function sendCode(isResend: boolean) {
    start(async () => {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("locale", locale);
      const res = await requestPasswordOtp(null, fd);
      setState(res);
      if (res?.ok && res.step === "verify") {
        setStep("verify");
        if (isResend) {
          setCode(["", "", "", "", "", ""]);
          setResent(true);
          boxes.current[0]?.focus();
        }
      }
    });
  }

  function onRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResent(false);
    sendCode(false);
  }

  function onVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    fd.set("email", email);
    fd.set("code", code.join(""));
    start(async () => {
      const res = await verifyPasswordOtp(null, fd);
      setState(res);
      if (res?.ok && res.step === "done") setStep("done");
    });
  }

  function setDigit(i: number, value: string) {
    const v = value.replace(/\D/g, "").slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    if (v && i < 5) boxes.current[i + 1]?.focus();
  }

  function onDigitKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      boxes.current[i - 1]?.focus();
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length) {
      e.preventDefault();
      const next = ["", "", "", "", "", ""];
      pasted.split("").forEach((d, idx) => (next[idx] = d));
      setCode(next);
      boxes.current[Math.min(pasted.length, 5)]?.focus();
    }
  }

  const error = errorText();

  // ── Done ────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <AuthShell title={t("resetTitle")}>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 size={22} />
          </span>
          <p className="text-sm text-fg/90">{t("passwordUpdated")}</p>
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

  // ── Verify: code + new password ───────────────────────────────────────────
  if (step === "verify") {
    return (
      <AuthShell
        title={t("otpVerifyTitle")}
        subtitle={t("otpVerifySubtitle", { email })}
        footer={
          <button
            type="button"
            onClick={() => {
              setStep("request");
              setState(null);
              setCode(["", "", "", "", "", ""]);
            }}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-accent"
          >
            <ArrowLeft size={14} />
            {t("backToLogin")}
          </button>
        }
      >
        <form onSubmit={onVerifySubmit} className="space-y-4">
          {resent && !error && <Alert tone="success">{t("otpResent")}</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}

          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg">
              {t("codeLabel")}
            </span>
            <div className="flex justify-between gap-2">
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxes.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  value={digit}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onDigitKeyDown(i, e)}
                  onPaste={i === 0 ? onPaste : undefined}
                  autoFocus={i === 0}
                  aria-label={`${t("codeLabel")} ${i + 1}`}
                  className={cn(
                    "h-13 w-full min-w-0 rounded-lg border bg-surface-2 text-center font-mono text-xl font-bold text-fg outline-none transition-colors focus:border-accent",
                    digit ? "border-accent" : "border-border",
                  )}
                />
              ))}
            </div>
          </div>

          <Field label={t("newPassword")} hint={t("passwordHint")}>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
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
            disabled={pending || code.join("").length < 6}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? tc("loading") : t("verifyAndReset")}
          </button>

          <p className="text-center text-sm text-muted">
            {t("otpNotReceived")}{" "}
            <button
              type="button"
              onClick={() => sendCode(true)}
              disabled={pending}
              className="font-medium text-accent transition-colors hover:opacity-80 disabled:opacity-50"
            >
              {t("resendCode")}
            </button>
          </p>
        </form>
      </AuthShell>
    );
  }

  // ── Request: email ────────────────────────────────────────────────────────
  return (
    <AuthShell
      title={t("forgotTitle")}
      subtitle={t("otpRequestSubtitle")}
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
      <form onSubmit={onRequestSubmit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label={t("email")}>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? tc("loading") : t("sendCode")}
        </button>
      </form>
    </AuthShell>
  );
}
