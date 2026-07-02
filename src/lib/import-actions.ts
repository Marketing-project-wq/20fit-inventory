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

export type ParseResult =
  | {
      ok: true;
      rows: ParsedRow[];
      cols: Cols;
      sheetName: string;
      truncated: boolean;
    }
  | { ok: false; error: string };

/** Parse an uploaded packing list (.xlsx / .xls / .csv) into structured rows. */
export async function parsePackingList(formData: FormData): Promise<ParseResult> {
  const { error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };

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
  if (cols.name == null && cols.code == null)
    return { ok: false, error: "no_columns" };

  const all = extractRows(grid, headerIndex, cols);
  if (all.length === 0) return { ok: false, error: "no_rows" };

  // Guard the client payload; a well-formed packing list is well under this.
  const LIMIT = 1000;
  const rows = all.slice(0, LIMIT);
  return { ok: true, rows, cols, sheetName, truncated: all.length > LIMIT };
}

// -------------------------------- Import -----------------------------------
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
    .max(1000),
});

export type ImportResult = {
  ok: boolean;
  count?: number;
  error?: string;
};

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
