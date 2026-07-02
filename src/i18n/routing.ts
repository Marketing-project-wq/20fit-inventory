import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Bahasa Indonesia is the default; English is the toggle.
  locales: ["id", "en"],
  defaultLocale: "id",
});

export type Locale = (typeof routing.locales)[number];
