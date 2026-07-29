import "server-only";

const LOGO_URL =
  "https://media.20fit.id/wp-content/uploads/2026/07/08-20FIT-SHOP-WHITE-1-scaled.png";

const COPY = {
  id: {
    preheader: "Kode reset password 20FIT Shop kamu",
    kicker: "SISTEM MANAJEMEN INVENTARIS",
    heading: "Kode Reset Password",
    intro: (email: string) =>
      `Ada permintaan reset password untuk akun <strong style="color:#F5F5F7;">${email}</strong> di 20FIT Shop Inventory.`,
    label: "MASUKKAN KODE INI DI HALAMAN RESET PASSWORD",
    expiry: "Kode berlaku <strong>10 menit</strong> dan hanya bisa dipakai satu kali.",
    ignore:
      "Jika kamu tidak meminta reset password, abaikan email ini. Password tidak akan berubah.",
    footer:
      "20FIT Shop Inventory Management System · Email ini dikirim otomatis, jangan dibalas.",
    subject: (code: string) => `${code} — Kode Reset Password 20FIT Shop`,
  },
  en: {
    preheader: "Your 20FIT Shop password reset code",
    kicker: "INVENTORY MANAGEMENT SYSTEM",
    heading: "Password Reset Code",
    intro: (email: string) =>
      `A password reset was requested for <strong style="color:#F5F5F7;">${email}</strong> on 20FIT Shop Inventory.`,
    label: "ENTER THIS CODE ON THE RESET PASSWORD PAGE",
    expiry: "The code is valid for <strong>10 minutes</strong> and can be used once.",
    ignore:
      "If you didn't request a password reset, ignore this email. Your password won't change.",
    footer:
      "20FIT Shop Inventory Management System · This email is automated, please don't reply.",
    subject: (code: string) => `${code} — 20FIT Shop Password Reset Code`,
  },
} as const;

type Locale = keyof typeof COPY;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Localized subject line for the OTP email. */
export function otpEmailSubject(code: string, locale = "id"): string {
  const c = COPY[(locale as Locale) in COPY ? (locale as Locale) : "id"];
  return c.subject(code);
}

/** Branded 20FIT Shop OTP email (dark theme, digits shown as separate boxes). */
export function buildOtpEmailHtml({
  code,
  email,
  locale = "id",
}: {
  code: string;
  email: string;
  locale?: string;
}): string {
  const c = COPY[(locale as Locale) in COPY ? (locale as Locale) : "id"];
  const safeEmail = escapeHtml(email);
  const digits = code.split("");

  const digitCells = digits
    .map(
      (d) => `
              <td style="padding:0 4px 0 0;">
                <div style="width:44px;height:54px;background:#1D1D1F;
                            border:1.5px solid #E4002B;border-radius:8px;
                            font-family:'Courier New',monospace;font-size:26px;
                            font-weight:700;color:#F5F5F7;text-align:center;
                            line-height:54px;">${d}</div>
              </td>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="${locale === "en" ? "en" : "id"}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${c.heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#0B0B0D;font-family:'Helvetica Neue',Arial,sans-serif;">
<span style="display:none;font-size:1px;color:#0B0B0D;max-height:0;max-width:0;opacity:0;overflow:hidden;">${c.preheader}</span>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0B0B0D;padding:40px 20px;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" border="0" style="background-color:#111114;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
      <tr>
        <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <img src="${LOGO_URL}" alt="20FIT Shop" height="28" style="display:block;border:0;" />
        </td>
      </tr>
      <tr>
        <td style="padding:32px 40px;">
          <p style="color:#9A9A9E;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">${c.kicker}</p>
          <h1 style="color:#F5F5F7;font-size:22px;font-weight:700;margin:0 0 20px;line-height:1.3;">${c.heading}</h1>
          <p style="color:#9A9A9E;font-size:14px;line-height:1.6;margin:0 0 28px;">${c.intro(safeEmail)}</p>
          <p style="color:#6E6E73;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">${c.label}</p>
          <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr>${digitCells}</tr></table>
          <div style="background:rgba(228,0,43,0.10);border:1px solid rgba(228,0,43,0.25);border-radius:8px;padding:12px 16px;margin:0 0 28px;">
            <p style="color:#FF6B6B;font-size:13px;margin:0;font-weight:500;">&#9201; ${c.expiry}</p>
          </div>
          <p style="color:#6E6E73;font-size:13px;line-height:1.6;margin:0;">${c.ignore}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="color:#6E6E73;font-size:11px;margin:0;">${c.footer}</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
