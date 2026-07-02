import type { NextRequest } from "next/server";
import QRCode from "qrcode";

export const runtime = "nodejs";

// GET /api/qr/<sku>?format=png|svg&size=300&download=1
// The QR value IS the SKU code (what a scanner reads back).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
) {
  const { sku } = await params;
  const code = decodeURIComponent(sku).trim();
  if (!code) return new Response("Missing SKU", { status: 400 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
  const size = Math.min(Math.max(Number(url.searchParams.get("size")) || 300, 64), 1024);
  const download = url.searchParams.get("download") === "1";

  const opts = {
    width: size,
    margin: 2,
    color: { dark: "#0F1117", light: "#FFFFFF" },
    errorCorrectionLevel: "M" as const,
  };

  const cache = "public, max-age=31536000, immutable";

  if (format === "svg") {
    const svg = await QRCode.toString(code, { type: "svg", ...opts });
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": cache,
        ...(download
          ? { "Content-Disposition": `attachment; filename="QR_${code}.svg"` }
          : {}),
      },
    });
  }

  const buffer = await QRCode.toBuffer(code, { type: "png", ...opts });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": cache,
      ...(download
        ? { "Content-Disposition": `attachment; filename="QR_${code}.png"` }
        : {}),
    },
  });
}
