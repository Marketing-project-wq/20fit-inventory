import { cn } from "@/lib/utils";

/*
 * 20FIT SHOP wordmark, rebuilt as a theme-aware inline lockup (no bitmap):
 *   "2 ◎ FIT | SHOP"  — the ◎ is a ring + red center dot, "SHOP" is brand red.
 *
 * Colours come from CSS variables, so it auto-adapts:
 *   - text (2, FIT, divider) = var(--fg): black in light mode, white in dark mode
 *   - the dot + SHOP         = var(--accent) = #BF0000 (brand red) in both modes
 *
 * Because it's driven purely by CSS variables there is no theme flash and no
 * client-side hydration guard needed. To use the official raster logos instead,
 * drop logo-shop-black.png / logo-shop-white.png into public/assets/logo/ and
 * swap this lockup for a <picture>/next<Image> pair keyed on the theme class.
 */
export function Logo20FIT({
  height = 26,
  className,
}: {
  height?: number;
  className?: string;
}) {
  const fontSize = Math.round(height * 0.82);
  const ring = Math.round(height * 0.8);
  const gap = Math.max(1, Math.round(height * 0.02));
  const dividerH = Math.round(height * 0.6);
  const dividerMargin = Math.round(height * 0.32);

  return (
    <span
      role="img"
      aria-label="20FIT Shop"
      className={cn(
        "inline-flex select-none items-center font-bold tracking-tight",
        className,
      )}
      style={{ height, fontSize, lineHeight: 1, color: "var(--fg)" }}
    >
      <span aria-hidden>2</span>
      <svg
        aria-hidden
        width={ring}
        height={ring}
        viewBox="0 0 100 100"
        style={{ margin: `0 ${gap}px`, flex: "0 0 auto" }}
      >
        <circle
          cx="50"
          cy="50"
          r="43"
          fill="none"
          stroke="currentColor"
          strokeWidth="13"
        />
        <circle cx="50" cy="50" r="23" fill="var(--accent)" />
      </svg>
      <span aria-hidden>FIT</span>
      <span
        aria-hidden
        style={{
          width: 1.5,
          height: dividerH,
          background: "currentColor",
          opacity: 0.35,
          margin: `0 ${dividerMargin}px`,
        }}
      />
      <span aria-hidden style={{ color: "var(--accent)", letterSpacing: "0.01em" }}>
        SHOP
      </span>
    </span>
  );
}
