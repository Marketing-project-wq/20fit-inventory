"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted ? resolvedTheme !== "light" : true;

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {/* Stable markup pre-mount (server + first client render) to avoid mismatch. */}
      {mounted ? (
        isDark ? (
          <Sun size={18} />
        ) : (
          <Moon size={18} />
        )
      ) : (
        <Sun size={18} className="opacity-0" />
      )}
    </button>
  );
}
