/*
 * SKU code generator for the Create SKU form (Settings → SKUs & Prices).
 *
 * Pattern (derived from the 37 existing 20FIT SKUs):
 *   20FIT-[CAT_CODE]-[SUFFIX]
 * where SUFFIX is either a weight taken from the product name, or a running
 * sequential number when the product has no weight.
 *
 * The existing data is inconsistent about weight placement — some SKUs bake the
 * weight into the category code (HSB10-001, HWB4-001) while the majority keep it
 * as a separate suffix (KB-016, BP-025, DB-010). New SKUs follow the cleaner,
 * majority pattern: weight as a separate suffix. The generated value is only a
 * suggestion; the user can always edit it by hand in the form.
 */

// Category name (exactly as stored in shop_categories.name) → SKU category code.
export const CATEGORY_CODE_MAP: Record<string, string> = {
  "Perform Treadmill": "TM",
  "Perform Rig & Accessories": "HBT",
  "Perform Turf": "TURF",
  "Octo Kettlebells": "KB",
  "Wall Ball": "HWB",
  Sandbag: "HSB",
  "Competition Power Sled & Power Rope": "HPS",
  "Interlocking Bumper Plates": "BP",
  "Urethane Dumbbells": "DB",
  Rower: "RW",
  "Ski Machine": "SKI",
  "Air Bike": "AB",
  "Half Rack": "HR",
};

export type GenerateNote =
  | { key: "generateNoteFallback"; params: { category: string; code: string } }
  | { key: "generateNoteDuplicate"; params: { sku: string } };

export type GenerateResult = {
  sku: string;
  method: "weight" | "sequential" | "fallback";
  note?: GenerateNote;
};

/**
 * Extract a weight in kg from a product name, if present.
 *   "Octo Kettlebell 16kg" → 16
 *   "Dumbbell 12.5kg"      → 12.5
 *   "Competition Power Sled" → null
 */
export function extractWeightKg(productName: string): number | null {
  const match = productName.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (!match) return null;
  const value = parseFloat(match[1].replace(",", "."));
  return Number.isNaN(value) ? null : value;
}

/**
 * Format a weight into a SKU suffix, following the existing data:
 *   Integer → 3 digits, zero-padded   (16 → "016", 8 → "008")
 *   Decimal → point removed, 4 digits  (12.5 → "0125", 2.5 → "0025")
 */
export function formatWeightSuffix(kg: number): string {
  if (Number.isInteger(kg)) {
    return Math.round(kg).toString().padStart(3, "0");
  }
  const noDecimal = kg.toString().replace(".", "");
  return noDecimal.padStart(4, "0");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Next 3-digit sequential number for a given `20FIT-<prefix>-NNN` family.
 * Returns "001" when none exist yet.
 */
export function getNextSequential(prefix: string, existingSkus: string[]): string {
  const pattern = new RegExp(`^20FIT-${escapeRegExp(prefix)}-(\\d{3})$`);
  const numbers = existingSkus
    .map((sku) => sku.match(pattern)?.[1])
    .filter((n): n is string => Boolean(n))
    .map((n) => parseInt(n, 10));
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return next.toString().padStart(3, "0");
}

/**
 * Suggest a SKU code from the selected category and typed product name.
 * Pure and synchronous — pass the SKUs already loaded on the page as
 * `existingSkus` so we can avoid duplicates and continue sequential numbering.
 */
export function generateSkuCode(params: {
  categoryName: string;
  productName: string;
  existingSkus: string[];
}): GenerateResult {
  const { categoryName, productName, existingSkus } = params;

  const catCode = CATEGORY_CODE_MAP[categoryName];

  // Unknown category → derive a code from the initials, flag it for review.
  if (!catCode) {
    const fallbackCode =
      categoryName
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 4) || "GEN";
    const seq = getNextSequential(fallbackCode, existingSkus);
    return {
      sku: `20FIT-${fallbackCode}-${seq}`,
      method: "fallback",
      note: {
        key: "generateNoteFallback",
        params: { category: categoryName, code: fallbackCode },
      },
    };
  }

  // Weight in the name → use it as the suffix.
  const weight = extractWeightKg(productName);
  if (weight !== null) {
    const suffix = formatWeightSuffix(weight);
    const candidate = `20FIT-${catCode}-${suffix}`;
    if (existingSkus.includes(candidate)) {
      const seq = getNextSequential(`${catCode}-${suffix}`, existingSkus);
      return {
        sku: `20FIT-${catCode}-${suffix}-${seq}`,
        method: "weight",
        note: { key: "generateNoteDuplicate", params: { sku: candidate } },
      };
    }
    return { sku: candidate, method: "weight" };
  }

  // No weight → running sequential number.
  const seq = getNextSequential(catCode, existingSkus);
  return { sku: `20FIT-${catCode}-${seq}`, method: "sequential" };
}
