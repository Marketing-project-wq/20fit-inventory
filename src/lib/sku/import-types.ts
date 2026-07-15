// Shared types for the SKU bulk import (used by the server actions and the UI).

export type ImportRow = {
  rowNum: number;
  product_name: string;
  sku_code: string;
  category: string;
  brand: string;
  product_name_en: string | null;
  cost_price: number | null;
  selling_price: number | null;
  unit: string;
  reorder_point: number | null;
  action: "create" | "update" | "error";
};

export type RowError = {
  rowNum: number;
  message: string;
  severity: "error" | "warning";
};

export type ParsePreview =
  | {
      ok: true;
      rows: ImportRow[];
      errors: RowError[];
      total: number;
      valid: number;
      toCreate: number;
      toUpdate: number;
      errorCount: number;
    }
  | { ok: false; error: string };

export type ImportResult = {
  ok: boolean;
  created: number;
  updated: number;
  failed: number;
  errors: { sku_code: string; message: string }[];
  error?: string;
};
