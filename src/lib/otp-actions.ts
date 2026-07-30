"use server";

import "server-only";
import { randomInt } from "node:crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { buildOtpEmailHtml, otpEmailSubject } from "@/lib/email/otp-template";

/**
 * Password reset by 6-digit email OTP — a branded, provider-independent
 * alternative to Supabase's magic-link recovery (whose email carried another
 * app's branding in this shared project). All state lives in
 * `shop_password_reset_otps`, reachable only via the service-role client.
 */
export type OtpState = {
  ok: boolean;
  error?: string;
  message?: string;
  step?: "request" | "verify" | "done";
  attemptsLeft?: number;
} | null;

const OTP_TABLE = "shop_password_reset_otps";
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 3; // per email per 15 min
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5; // per code

const emailSchema = z.string().trim().toLowerCase().email();
const codeSchema = z.string().trim().regex(/^\d{6}$/);

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

/** Step 1 — email a fresh 6-digit code. Always reports success to avoid
 *  revealing whether an address is registered. */
export async function requestPasswordOtp(
  _prev: OtpState,
  formData: FormData,
): Promise<OtpState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, error: "email_invalid" };
  const email = parsed.data;
  const locale = String(formData.get("locale") ?? "id");

  const sb = createSupabaseAdminClient();
  if (!sb) return { ok: false, error: "not_configured" };

  // Rate limit by email first, so a 429 never depends on whether the account
  // exists (no enumeration signal).
  const since = new Date(Date.now() - REQUEST_WINDOW_MS).toISOString();
  const { count } = await sb
    .from(OTP_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("email", email)
    .gt("created_at", since);
  if ((count ?? 0) >= MAX_REQUESTS_PER_WINDOW) {
    return { ok: false, error: "rate_limited" };
  }

  // Only generate + send when the account actually exists; otherwise fall
  // through to the same generic success (and the verify step will simply fail).
  const { data: userId } = await sb.rpc("shop_find_auth_user_by_email", {
    p_email: email,
  });

  if (userId) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const code_hash = await bcrypt.hash(code, 10);
    await sb.from(OTP_TABLE).insert({
      email,
      code_hash,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      ip_address: await clientIp(),
    });
    const { sent } = await sendEmail({
      to: email,
      subject: otpEmailSubject(code, locale),
      html: buildOtpEmailHtml({ code, email, locale }),
    });
    // A stored code that never reached the user is a dead end: don't advance
    // the UI to the code-entry step. sendEmail already logged the provider
    // reason; add the flow context here without leaking it to the client.
    if (!sent) {
      console.error(
        `[otp] requestPasswordOtp: email delivery failed for ${email} — code not sent.`,
      );
      return { ok: false, error: "email_send_failed" };
    }
  }

  return { ok: true, step: "verify", message: "code_sent" };
}

/** Step 2 — verify the code and set the new password. */
export async function verifyPasswordOtp(
  _prev: OtpState,
  formData: FormData,
): Promise<OtpState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const code = codeSchema.safeParse(formData.get("code"));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email.success) return { ok: false, error: "email_invalid", step: "verify" };
  if (password.length < 8)
    return { ok: false, error: "password_short", step: "verify" };
  if (password !== confirm)
    return { ok: false, error: "password_mismatch", step: "verify" };
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
  await sb
    .from(OTP_TABLE)
    .update({ attempts: otp.attempts + 1 })
    .eq("id", otp.id);

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

  const { data: userId } = await sb.rpc("shop_find_auth_user_by_email", {
    p_email: email.data,
  });
  if (!userId) return { ok: false, error: "user_not_found", step: "verify" };

  const { error: updErr } = await sb.auth.admin.updateUserById(userId, {
    password,
  });
  if (updErr) return { ok: false, error: "update_failed", step: "verify" };

  // Burn the code so it can't be replayed.
  await sb.from(OTP_TABLE).update({ used: true }).eq("id", otp.id);

  return { ok: true, step: "done", message: "password_updated" };
}
