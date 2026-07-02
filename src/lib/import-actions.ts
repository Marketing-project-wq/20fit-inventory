"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { extractRows, type Cols, type ParsedRow } from "@/lib/import";
import { requireUser, readGrid, ROW_LIMIT } from "@/lib/import-server";

export type ParseResult =
  | { ok: true; rows: ParsedRow[]; cols: Cols; sheetName: string; truncated: boolean }
  | { ok: false; error: string };

// ----------------------------- Packing list --------------------------------
/** Parse an uploaded packing list (.xlsx / .xls / .csv) into structured rows. */
export async function parsePackingList(formData: FormData): Promise<ParseResult> {
  const { error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };

  const g = await readGrid(formData);
  if (!g.ok) return g;
  if (g.cols.name == null && g.cols.code == null)
    return { ok: false, error: "no_columns" };

  const all = extractRows(g.grid, g.headerIndex, g.cols);
  if (all.length === 0) return { ok: false, error: "no_rows" };
  return {
    ok: true,
    rows: all.slice(0, ROW_LIMIT),
    cols: g.cols,
    sheetName: g.sheetName,
    truncated: all.length > ROW_LIMIT,
  };
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
      }),
    )
    .min(1)
    .max(ROW_LIMIT),
});

export type ImportResult = { ok: boolean; count?: number; error?: string };

/** Commit the confirmed rows as a single atomic bulk goods-in. */
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
    })),
    p_reference: d.reference || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, count: typeof data === "number" ? data : d.items.length };
}
