import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Logo is hosted on the 20FIT WordPress CDN (external <Image> source).
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.20fit.id",
        pathname: "/wp-content/uploads/**",
      },
    ],
  },
  // pdfjs-dist (Xero PDF quotation parsing) runs only in Server Actions; keep it
  // external so the bundler doesn't try to pull in its worker build.
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    // File uploads (packing list / Xero) are sent to a Server Action; the
    // default 1 MB cap is too small for real supplier files.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default withNextIntl(nextConfig);
