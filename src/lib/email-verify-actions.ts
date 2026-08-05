"use server";

import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { issueVerificationCode } from "@/lib/email/verify-otp";

/**
 * Custom sign-up email verification via 6-digit OTP (the branded, provider-
 * independent counterpart to the password-reset OTP). State lives in
 * `shop_email_verification_otps`, reachable only via the service-role client.
 * Success flips `shop_staff.email_verified`, which the middleware gate requires
 * before granting app access.
 */
export type VerifyState = {
  ok: boolean;
  error?: string;
  message?: string;
  step?: "verify" | "done";
  attemptsLeft?: number;
} | null;

const OTP_TABLE = "shop_email_verification_otps";
const MAX_ATTEMPTS = 5;

const emailSchema = z.string().trim().toLowerCase().email();
const codeSchema = z.string().trim().regex(/^\d{6}$/);

/** Escape LIKE/ILIKE wildcards so an email matches literally. */
function likeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

/** Resend a verification code. Only sends when an UNVERIFIED shop_staff row
 *  exists for the email; always reports success otherwise (no enumeration). */
export async function resendVerificationOtp(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, error: "email_invalid", step: "verify" };
  const email = parsed.data;
  const locale = String(formData.get("locale") ?? "id");

  const sb = createSupabaseAdminClient();
  if (!sb) return { ok: false, error: "not_configured", step: "verify" };

  const { data: staff } = await sb
    .from("shop_staff")
    .select("email_verified")
    .ilike("email", likeLiteral(email))
    .maybeSingle();

  if (staff && staff.email_verified === false) {
    const res = await issueVerificationCode(email, locale);
    if (!res.ok && res.error === "rate_limited")
      return { ok: false, error: "rate_limited", step: "verify" };
    if (!res.ok && res.error === "email_send_failed")
      return { ok: false, error: "email_send_failed", step: "verify" };
  }
  return { ok: true, step: "verify", message: "code_sent" };
}

/** Verify the 6-digit code and mark the staff row's email as verified. */
export async function verifyEmailOtp(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const code = codeSchema.safeParse(formData.get("code"));
  if (!email.success) return { ok: false, error: "email_invalid", step: "verify" };
  if (!code.success) return { ok: false, error: "otp_invalid", step: "verify" };

  const sb = createSupabaseAdminClient();
  if (!sb) return { ok: false, error: "not_configured", step: "verify" };

  const { data: rows } = await sb
    .from(OTP_TABLE)
    .select("id, code_hash, attempts")
    .eq("email", email.data)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  const otp = rows?.[0];
  if (!otp) return { ok: false, error: "otp_expired", step: "verify" };

  if (otp.attempts >= MAX_ATTEMPTS) {
    await sb.from(OTP_TABLE).update({ used: true }).eq("id", otp.id);
    return { ok: false, error: "otp_too_many", step: "verify" };
  }

  // Count this attempt before checking, so brute force can't get free tries.
  await sb.from(OTP_TABLE).update({ attempts: otp.attempts + 1 }).eq("id", otp.id);

  const valid = await bcrypt.compare(code.data, otp.code_hash);
  if (!valid) {
    const attemptsLeft = MAX_ATTEMPTS - (otp.attempts + 1);
    return {
      ok: false,
      error: attemptsLeft > 0 ? "otp_wrong" : "otp_too_many",
      attemptsLeft: Math.max(0, attemptsLeft),
      step: "verify",
    };
  }

  const { error: updErr } = await sb
    .from("shop_staff")
    .update({ email_verified: true, updated_at: new Date().toISOString() })
    .ilike("email", likeLiteral(email.data));
  if (updErr) return { ok: false, error: "update_failed", step: "verify" };

  // Burn the code so it can't be replayed.
  await sb.from(OTP_TABLE).update({ used: true }).eq("id", otp.id);

  return { ok: true, step: "done", message: "email_verified" };
}
