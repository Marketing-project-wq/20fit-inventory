"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/*
 * 20FIT SHOP logo — hosted on media.20fit.id (WordPress CDN), theme-aware:
 *   LIGHT → 07-…-BLACK  (black text + red circle, transparent bg)
 *   DARK  → 08-…-WHITE  (white text + red circle, transparent bg)
 *
 * The source PNG is 6800×2500 but the wordmark only fills a ~5355×700 box
 * (left-aligned, vertically centred — lots of transparent padding). So the
 * frame is sized to the CONTENT aspect ratio and the image is `cover` + left
 * center, which crops the padding and lets the logo fill the given height.
 * (Plain objectFit:contain on the full file would render it tiny.)
 */
const LOGO = {
  dark: "https://media.20fit.id/wp-content/uploads/2026/07/08-20FIT-SHOP-WHITE-1-scaled.png",
  light: "https://media.20fit.id/wp-content/uploads/2026/07/07-20FIT-SHOP-BLACK-1-scaled.png",
};

const CONTENT_ASPECT = 5355 / 700; // ≈ 7.65 : 1

export function Logo20FIT({
  height = 40,
  className,
}: {
  height?: number;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const width = Math.round(height * CONTENT_ASPECT);

  // Reserve the space before the theme is known to avoid layout shift / mismatch.
  if (!mounted) {
    return (
      <div
        style={{ width, height }}
        className={cn("shrink-0", className)}
        aria-hidden
      />
    );
  }

  const src = resolvedTheme === "dark" ? LOGO.dark : LOGO.light;
  return (
    <div
      style={{ width, height, position: "relative" }}
      className={cn("shrink-0", className)}
    >
      <Image
        src={src}
        alt="20FIT Shop"
        fill
        priority
        sizes={`${width}px`}
        style={{ objectFit: "cover", objectPosition: "left center" }}
      />
    </div>
  );
}
