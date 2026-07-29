import "server-only";

type SendArgs = { to: string; subject: string; html: string };

/**
 * Minimal transactional-email sender.
 *
 * Uses Resend when RESEND_API_KEY is configured; otherwise it logs the message
 * server-side and reports `sent: false`, so the OTP flow is fully testable in
 * development (and degrades safely in production) without a provider wired up.
 *
 * The `from` address must be on a domain verified in Resend — configure it via
 * RESEND_FROM (e.g. "20FIT Shop <noreply@20fit.id>").
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendArgs): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "20FIT Shop <noreply@20fit.id>";

  if (!key) {
    // Dev / not-yet-configured fallback: never throw, just make it visible.
    console.warn(
      `[email] RESEND_API_KEY not set — "${subject}" to ${to} was NOT sent.`,
    );
    return { sent: false };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(key);
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) {
      console.error("[email] Resend send failed:", error);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] unexpected send error:", err);
    return { sent: false };
  }
}
