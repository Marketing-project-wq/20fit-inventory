import type { Metadata } from "next";
import { Barlow_Condensed, JetBrains_Mono, Manrope } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import "../globals.css";

// 20FIT Design System v1.0 — Barlow Condensed (display), JetBrains Mono (data),
// Manrope (body).
const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-barlow",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jbmono",
  display: "swap",
});
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "20FIT Shop — Sistem Manajemen Inventaris",
  description:
    "Manajemen inventaris 20FIT Shop: stok multi-lokasi, mutasi barang, QR Code, dan pelaporan.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Enable static rendering for this locale.
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${barlow.variable} ${jetbrains.variable} ${manrope.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased">
        <ThemeProvider>
          <NextIntlClientProvider>
            <AppShell>{children}</AppShell>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
