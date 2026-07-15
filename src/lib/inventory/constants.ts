// Shared constants for the Barang Masuk (Goods In) return & damage features.

export type ItemCondition = "good" | "damaged";

/** Reason codes shown in the Return form. Labels are translated in the UI. */
export const RETURN_REASONS = [
  "wrong_item",
  "damaged",
  "expired",
  "not_ordered",
  "customer_change_mind",
  "other",
] as const;

/** Reason codes for goods that arrive already damaged (from the supplier). */
export const DAMAGE_IN_REASONS = [
  "damaged_in_transit",
  "manufacturing_defect",
  "packaging_damage",
  "other",
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];
export type DamageInReason = (typeof DAMAGE_IN_REASONS)[number];

export const MAX_ITEM_PHOTO_BYTES = 10_000_000; // 10MB
