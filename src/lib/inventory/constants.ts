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

// --------------------------- Goods Out (Barang Keluar) ---------------------

/** Manual goods-out flows. Each maps to a movement type + the stock pool it
 *  draws from. `sale` keeps its own richer form (channels, backorder). */
export type GoodsOutKind = "sale" | "warranty" | "disposal" | "return_supplier";

/** Purpose codes shown in the Warranty / Repair form. */
export const WARRANTY_OUT_REASONS = [
  "warranty_claim",
  "repair_service",
  "supplier_inspection",
  "other",
] as const;
export type WarrantyOutReason = (typeof WARRANTY_OUT_REASONS)[number];

/** Lifecycle of a warranty claim. `color` maps to a design-token utility. */
export const WARRANTY_CLAIM_STATUSES = [
  { value: "sent", tone: "info" },
  { value: "in_repair", tone: "warning" },
  { value: "resolved", tone: "success" },
  { value: "rejected", tone: "danger" },
  { value: "closed", tone: "dim" },
] as const;
export type WarrantyClaimStatus =
  (typeof WARRANTY_CLAIM_STATUSES)[number]["value"];
