"use server";

import * as XLSX from "xlsx";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { detectColumns, extractRows, type Cols, type ParsedRow } from "@/lib/import";

async function requireUser() {
  const sb = await createSupabaseServerClient();
  if (!sb) return { sb: null, error: "not_configured" as const };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { sb: null, error: "unauthorized" as const };
  return { sb, error: null as null };
}

const MAX_BYTES = 5_000_000;
const ROW_LIMIT = 1000;

// Shared spreadsheet reader (private — not a Server Action). Turns an uploaded
// .xlsx/.xls/.csv into a raw 2-D grid + detected columns.
async function readGrid(
  formData: FormData,
): Promise<
  | { ok: true; grid: unknown[][]; cols: Cols; headerIndex: number; sheetName: string }
  | { ok: false; error: string }
> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "no_file" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };

  let grid: unknown[][];
  let sheetName: string;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array" });
    sheetName = wb.SheetNames[0] ?? "";
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!sheet) return { ok: false, error: "empty" };
    grid = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    }) as unknown[][];
  } catch {
    return { ok: false, error: "parse_failed" };
  }
  if (!grid.length) return { ok: false, error: "empty" };

  const { headerIndex, cols } = detectColumns(grid);
  return { ok: true, grid, cols, headerIndex, sheetName };
}

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

// --------------------------- Xero quotation --------------------------------
/** Parse an uploaded Xero quotation/invoice (.xlsx / .xls / .csv). Requires a
 *  unit-price column (Xero "UnitAmount"). */
export async function parseXeroQuotation(formData: FormData): Promise<ParseResult> {
  const { error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };

  const g = await readGrid(formData);
  if (!g.ok) return g;
  if (g.cols.name == null && g.cols.code == null)
    return { ok: false, error: "no_columns" };
  if (g.cols.price == null) return { ok: false, error: "no_price_column" };

  const all = extractRows(g.grid, g.headerIndex, g.cols).filter(
    (r) => r.unit_cost != null,
  );
  if (all.length === 0) return { ok: false, error: "no_rows" };
  return {
    ok: true,
    rows: all.slice(0, ROW_LIMIT),
    cols: g.cols,
    sheetName: g.sheetName,
    truncated: all.length > ROW_LIMIT,
  };
}

const priceSchema = z.object({
  field: z.enum(["cost_price", "selling_price"]),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        price: z.number().nonnegative(),
      }),
    )
    .min(1)
    .max(ROW_LIMIT),
});

/** Commit the confirmed rows as a single atomic bulk price update. */
export async function updatePricesFromXero(input: unknown): Promise<ImportResult> {
  const { sb, error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };

  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const { data, error } = await sb!.rpc("shop_update_prices", {
    p_field: d.field,
    p_items: d.items.map((i) => ({ variant_id: i.variant_id, price: i.price })),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, count: typeof data === "number" ? data : d.items.length };
}
