import "server-only";
import { randomInt } from "node:crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { buildVerifyEmailHtml, verifyEmailSubject } from "@/lib/email/verify-template";

/**
 * Shared generate-store-send for the sign-up email-verification OTP. A plain
 * server-only helper (NOT a server action) so both the sign-up action and the
 * resend action can call it. Mirrors the password-reset OTP throttling, using a
 * dedicated table and the shared per-IP request log.
 */
const OTP_TABLE = "shop_email_verification_otps";
const IP_TABLE = "shop_otp_ip_requests";
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5; // per email per 15 min (sign-up + a few resends)
const MAX_REQUESTS_PER_IP = 15; // per IP per 15 min (staff may share a NAT)
const REQUEST_WINDOW_MS = 15 * 60 * 1000;

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

/** Edge-observed client IP (unspoofable via a client's own x-forwarded-for),
 *  falling back to the leftmost x-forwarded-for hop. */
async function rateLimitIp(): Promise<string | null> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  return clientIp();
}

export type IssueResult = {
  ok: boolean;
  error?: "rate_limited" | "email_send_failed" | "not_configured";
};

/**
 * Generate, store (bcrypt-hashed), and email a fresh 6-digit verification code.
 * Rate-limited per email and per IP. The caller must have already ensured the
 * auth account + shop_staff row exist for `email`.
 */
export async function issueVerificationCode(
  email: string,
  locale: string,
): Promise<IssueResult> {
  const sb = createSupabaseAdminClient();
  if (!sb) return { ok: false, error: "not_configured" };

  const windowStart = new Date(Date.now() - REQUEST_WINDOW_MS).toISOString();

  const ip = await rateLimitIp();
  if (ip) {
    const { count: ipCount } = await sb
      .from(IP_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gt("created_at", windowStart);
    if ((ipCount ?? 0) >= MAX_REQUESTS_PER_IP) return { ok: false, error: "rate_limited" };
    await sb.from(IP_TABLE).insert({ ip_address: ip });
  }

  const { count } = await sb
    .from(OTP_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("email", email)
    .gt("created_at", windowStart);
  if ((count ?? 0) >= MAX_REQUESTS_PER_WINDOW) return { ok: false, error: "rate_limited" };

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
    subject: verifyEmailSubject(locale),
    html: buildVerifyEmailHtml({ code, email, locale }),
  });
  if (!sent) {
    console.error(
      `[verify] issueVerificationCode: email delivery failed for ${email} — code not sent.`,
    );
    return { ok: false, error: "email_send_failed" };
  }
  return { ok: true };
}
