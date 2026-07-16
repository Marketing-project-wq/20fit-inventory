"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, MAX_BYTES } from "@/lib/import-server";
import { groupRowsByPosition, type PosItem } from "@/lib/xero";
import { parseCentrRows, type CentrSoMeta } from "@/lib/centr";

export type CentrReviewRow = {
  centr_item_code: string;
  item_name: string;
  quantity: number;
  unit_price_usd: number;
  variant_id: string | null;
  sku_code: string | null;
  product_name: string | null;
  matched: boolean;
};

export type CentrParseResult =
  | { ok: true; meta: CentrSoMeta; rows: CentrReviewRow[]; freight_usd: number }
  | { ok: false; error: string };

/** Extract positioned-text rows from a PDF, one string[] per visual row. */
async function pdfRows(buf: Uint8Array): Promise<string[][]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({
    data: buf,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  const rows: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const pos: PosItem[] = [];
    for (const it of tc.items) {
      const item = it as { str?: string; transform?: number[] };
      if (item.str && item.str.trim() && item.transform) {
        pos.push({ x: item.transform[4], y: item.transform[5], s: item.str });
      }
    }
    rows.push(...groupRowsByPosition(pos));
  }
  return rows;
}

/** Parse an uploaded CENTR Sales Order PDF and resolve item codes to SKUs. */
export async function parseCentrSoFile(formData: FormData): Promise<CentrParseResult> {
  const { sb, error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };
  if (!/\.pdf$/i.test(file.name)) return { ok: false, error: "not_pdf" };

  let parsed;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    parsed = parseCentrRows(await pdfRows(buf));
  } catch {
    return { ok: false, error: "parse_failed" };
  }
  if (parsed.items.length === 0) return { ok: false, error: "no_items" };

  // Resolve CENTR item codes → SKU via the mapping table.
  const codes = parsed.items.map((i) => i.centr_item_code);
  const [mappings, variants, products] = await Promise.all([
    sb!
      .from("shop_centr_item_mappings")
      .select("centr_item_code,variant_id")
      .in("centr_item_code", codes),
    sb!.from("shop_product_variants").select("variant_id,product_id,sku_code"),
    sb!.from("shop_products").select("product_id,name"),
  ]);
  const nameById = new Map((products.data ?? []).map((p) => [p.product_id, p.name]));
  const variantById = new Map((variants.data ?? []).map((v) => [v.variant_id, v]));
  const mapByCode = new Map(
    (mappings.data ?? []).map((m) => [m.centr_item_code, m.variant_id]),
  );

  const rows: CentrReviewRow[] = parsed.items.map((it) => {
    const variantId = mapByCode.get(it.centr_item_code) ?? null;
    const v = variantId ? variantById.get(variantId) : undefined;
    return {
      centr_item_code: it.centr_item_code,
      item_name: it.item_name,
      quantity: it.quantity,
      unit_price_usd: it.unit_price_usd,
      variant_id: variantId,
      sku_code: v?.sku_code ?? null,
      product_name: v ? (nameById.get(v.product_id) ?? null) : null,
      matched: Boolean(variantId),
    };
  });

  return { ok: true, meta: parsed.meta, rows, freight_usd: parsed.freight_usd };
}

// --------------------------------- Import ----------------------------------
const importSchema = z.object({
  location_id: z.string().uuid(),
  so_number: z.string().trim().max(60).optional(),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.coerce.number().int().positive(),
        centr_item_code: z.string().trim().max(120),
        unit_price_usd: z.coerce.number().nonnegative(),
      }),
    )
    .min(1),
});

export type CentrImportResult = { ok: boolean; count?: number; error?: string };

export async function importCentrSo(input: unknown): Promise<CentrImportResult> {
  const { sb, error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const { data, error } = await sb!.rpc("shop_import_centr_so", {
    p_location: d.location_id,
    p_reference: d.so_number || null,
    p_items: d.items.map((i) => ({
      variant_id: i.variant_id,
      quantity: i.quantity,
      notes: `SO ${d.so_number ?? "-"} · ${i.centr_item_code} · $${i.unit_price_usd.toFixed(2)}/unit`,
    })),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, count: typeof data === "number" ? data : d.items.length };
}

// ------------------------------ Learn mapping ------------------------------
const mapSchema = z.object({
  centr_item_code: z.string().trim().min(1).max(120),
  centr_item_name: z.string().trim().max(200).optional(),
  variant_id: z.string().uuid(),
});

export async function saveCentrMapping(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const { sb, error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };
  const parsed = mapSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const { error } = await sb!.from("shop_centr_item_mappings").upsert(
    {
      centr_item_code: d.centr_item_code,
      centr_item_name: d.centr_item_name ?? null,
      variant_id: d.variant_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "centr_item_code" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
