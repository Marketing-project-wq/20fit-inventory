"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Class-based light/dark theming persisted to localStorage. Dark is default. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="20fit-inventory-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
