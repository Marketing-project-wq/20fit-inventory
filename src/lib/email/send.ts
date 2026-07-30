import "server-only";

type SendArgs = { to: string; subject: string; html: string };

const MAILTRAP_ENDPOINT = "https://send.api.mailtrap.io/api/send";

/**
 * Minimal transactional-email sender.
 *
 * Uses Mailtrap's Transactional Send API (via native fetch, no SDK) when
 * MAILTRAP_API_TOKEN is configured; otherwise it logs the message server-side
 * and reports `sent: false`, so the OTP flow is fully testable in development
 * (and degrades safely in production) without a provider wired up.
 *
 * The `from` address must be on a domain verified in Mailtrap — configure it
 * via MAILTRAP_FROM (e.g. "noreply@20fit.id").
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendArgs): Promise<{ sent: boolean }> {
  const token = process.env.MAILTRAP_API_TOKEN;
  const from = process.env.MAILTRAP_FROM ?? "noreply@20fit.id";

  if (!token) {
    // Dev / not-yet-configured fallback: never throw, just make it visible.
    console.warn(
      `[email] MAILTRAP_API_TOKEN not set — "${subject}" to ${to} was NOT sent.`,
    );
    return { sent: false };
  }

  try {
    const res = await fetch(MAILTRAP_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: from, name: "20FIT Shop" },
        to: [{ email: to }],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[email] Mailtrap send failed: ${res.status} ${res.statusText} ${detail}`,
      );
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] unexpected send error:", err);
    return { sent: false };
  }
}
