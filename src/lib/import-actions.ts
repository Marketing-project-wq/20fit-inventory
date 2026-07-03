"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractRows,
  matchPacking,
  normalize,
  type Cols,
  type MatchedRow,
  type SkuLite,
} from "@/lib/import";
import { requireUser, readGrid, ROW_LIMIT } from "@/lib/import-server";

async function loadSkusAndMappings(sb: SupabaseClient) {
  const [variants, products, mappings] = await Promise.all([
    sb.from("shop_product_variants").select("variant_id,product_id,sku_code"),
    sb.from("shop_products").select("product_id,name"),
    sb.from("shop_packing_list_mappings").select("source_description,variant_id"),
  ]);
  const nameById = new Map(
    (products.data ?? []).map((p) => [p.product_id, p.name]),
  );
  const skus: SkuLite[] = (variants.data ?? []).map((v) => ({
    variant_id: v.variant_id,
    sku_code: v.sku_code,
    product_name: nameById.get(v.product_id) ?? v.sku_code,
  }));
  const skuById = new Map(skus.map((s) => [s.variant_id, s]));
  const mappingByDesc = new Map<string, SkuLite>();
  for (const m of mappings.data ?? []) {
    const s = skuById.get(m.variant_id);
    if (s) mappingByDesc.set(normalize(m.source_description), s);
  }
  return { skus, mappingByDesc };
}

function headerLabels(grid: unknown[][], headerIndex: number): string[] {
  return (grid[headerIndex] ?? []).map((c) => String(c ?? "").trim());
}

export type PackingParseResult =
  | { ok: true; needsMapping: false; rows: MatchedRow[]; truncated: boolean }
  | {
      ok: true;
      needsMapping: true;
      headers: string[];
      autoName: number | null;
      autoQty: number | null;
    }
  | { ok: false; error: string };

/** Parse a packing list, auto-detecting columns. Falls back to asking the UI to
 *  map columns when the product-name or quantity column can't be found. */
export async function parsePackingList(
  formData: FormData,
): Promise<PackingParseResult> {
  const { sb, error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };

  const g = await readGrid(formData);
  if (!g.ok) return g;

  const hasName = g.cols.name != null || g.cols.code != null;
  if (!hasName || g.cols.qty == null) {
    return {
      ok: true,
      needsMapping: true,
      headers: headerLabels(g.grid, g.headerIndex),
      autoName: g.cols.name ?? g.cols.code,
      autoQty: g.cols.qty,
    };
  }

  const { skus, mappingByDesc } = await loadSkusAndMappings(sb!);
  const all = extractRows(g.grid, g.headerIndex, g.cols);
  if (all.length === 0) return { ok: false, error: "no_rows" };
  const rows = matchPacking(all.slice(0, ROW_LIMIT), mappingByDesc, skus);
  return { ok: true, needsMapping: false, rows, truncated: all.length > ROW_LIMIT };
}

const colIndex = z.coerce.number().int().min(0);

/** Re-parse with user-chosen column indices (from the column-mapping step). */
export async function parsePackingListMapped(
  formData: FormData,
): Promise<PackingParseResult> {
  const { sb, error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };

  const nameCol = colIndex.safeParse(formData.get("name_col"));
  const qtyCol = colIndex.safeParse(formData.get("qty_col"));
  if (!nameCol.success || !qtyCol.success)
    return { ok: false, error: "invalid_input" };

  const g = await readGrid(formData);
  if (!g.ok) return g;

  const cols: Cols = {
    name: nameCol.data,
    qty: qtyCol.data,
    code: null,
    cartons: null,
    per: null,
    price: null,
  };
  const { skus, mappingByDesc } = await loadSkusAndMappings(sb!);
  const all = extractRows(g.grid, g.headerIndex, cols);
  if (all.length === 0) return { ok: false, error: "no_rows" };
  const rows = matchPacking(all.slice(0, ROW_LIMIT), mappingByDesc, skus);
  return { ok: true, needsMapping: false, rows, truncated: all.length > ROW_LIMIT };
}

const importSchema = z.object({
  location_id: z.string().uuid(),
  reference: z.string().trim().max(200).optional(),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.coerce.number().int().positive(),
        unit_cost: z.number().nonnegative().nullable().optional(),
        description: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(ROW_LIMIT),
});

export type ImportResult = { ok: boolean; count?: number; error?: string };

/** Commit the confirmed rows as one atomic bulk goods-in, learning mappings. */
export async function importPackingList(input: unknown): Promise<ImportResult> {
  const { sb, error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };

  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const { data, error } = await sb!.rpc("shop_import_packing_list", {
    p_location: d.location_id,
    p_items: d.items.map((i) => ({
      variant_id: i.variant_id,
      quantity: i.quantity,
      unit_cost: i.unit_cost ?? null,
      description: i.description ?? null,
    })),
    p_reference: d.reference || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, count: typeof data === "number" ? data : d.items.length };
}
