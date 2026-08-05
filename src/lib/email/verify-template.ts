import "server-only";

const LOGO_URL =
  "https://media.20fit.id/wp-content/uploads/2026/07/08-20FIT-SHOP-WHITE-1-scaled.png";

const COPY = {
  id: {
    preheader: "Kode verifikasi akun 20FIT Shop kamu",
    kicker: "SISTEM MANAJEMEN INVENTARIS",
    heading: "Verifikasi Email Kamu",
    intro: (email: string) =>
      `Terima kasih sudah mendaftar di 20FIT Shop Inventory dengan <strong style="color:#F5F5F7;">${email}</strong>. Masukkan kode di bawah untuk mengaktifkan akunmu.`,
    label: "MASUKKAN KODE INI DI HALAMAN VERIFIKASI",
    expiry: "Kode berlaku <strong>10 menit</strong> dan hanya bisa dipakai satu kali.",
    ignore:
      "Jika kamu tidak mendaftar di 20FIT Shop, abaikan email ini — tidak ada akun yang akan aktif tanpa kode ini.",
    footer:
      "20FIT Shop Inventory Management System · Email ini dikirim otomatis, jangan dibalas.",
    subject: "Verifikasi akun 20FIT Shop Anda",
  },
  en: {
    preheader: "Your 20FIT Shop account verification code",
    kicker: "INVENTORY MANAGEMENT SYSTEM",
    heading: "Verify Your Email",
    intro: (email: string) =>
      `Thanks for signing up for 20FIT Shop Inventory with <strong style="color:#F5F5F7;">${email}</strong>. Enter the code below to activate your account.`,
    label: "ENTER THIS CODE ON THE VERIFICATION PAGE",
    expiry: "The code is valid for <strong>10 minutes</strong> and can be used once.",
    ignore:
      "If you didn't sign up for 20FIT Shop, ignore this email — no account is activated without this code.",
    footer:
      "20FIT Shop Inventory Management System · This email is automated, please don't reply.",
    subject: "Verify your 20FIT Shop account",
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

/** Localized subject line for the verification email. */
export function verifyEmailSubject(locale = "id"): string {
  const c = COPY[(locale as Locale) in COPY ? (locale as Locale) : "id"];
  return c.subject;
}

/** Branded 20FIT Shop email-verification email (matches the OTP reset style). */
export function buildVerifyEmailHtml({
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
