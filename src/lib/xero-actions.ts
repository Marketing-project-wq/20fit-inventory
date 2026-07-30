"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractRows, normalize, type SkuLite } from "@/lib/import";
import { requireUser, readGrid, ROW_LIMIT, MAX_BYTES } from "@/lib/import-server";
import {
  groupRowsByPosition,
  parseXeroRows,
  matchXero,
  type PosItem,
  type XeroMatchedRow,
  type XeroMeta,
} from "@/lib/xero";

export type XeroParseResult =
  | {
      ok: true;
      source: "pdf" | "csv";
      meta: XeroMeta;
      rows: XeroMatchedRow[];
      truncated: boolean;
    }
  | { ok: false; error: string };

export type XeroImportResult = {
  ok: boolean;
  count?: number;
  error?: string;
  detail?: string;
};

async function loadSkusAndMappings(sb: SupabaseClient) {
  const [variants, products, mappings] = await Promise.all([
    sb.from("shop_product_variants").select("variant_id,product_id,sku_code"),
    sb.from("shop_products").select("product_id,name"),
    sb.from("shop_xero_product_mappings").select("xero_description,variant_id"),
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
    if (s) mappingByDesc.set(normalize(m.xero_description), s);
  }
  return { skus, mappingByDesc };
}

/** Extract positioned text from a PDF, one array of {x,y,str} per page. */
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
    // Group per page so pages never intermix rows; keep page order.
    rows.push(...groupRowsByPosition(pos));
  }
  return rows;
}

/** Parse an uploaded Xero quotation (PDF primary format, CSV/Excel fallback). */
export async function parseXeroFile(formData: FormData): Promise<XeroParseResult> {
  const { sb, error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "no_file" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };

  const { skus, mappingByDesc } = await loadSkusAndMappings(sb!);
  const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";

  if (isPdf) {
    let meta: XeroMeta;
    let items;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const rowsText = await pdfRows(buf);
      ({ meta, items } = parseXeroRows(rowsText));
    } catch {
      return { ok: false, error: "pdf_failed" };
    }
    if (!items.length) return { ok: false, error: "no_items" };
    const rows = matchXero(items.slice(0, ROW_LIMIT), mappingByDesc, skus);
    return { ok: true, source: "pdf", meta, rows, truncated: items.length > ROW_LIMIT };
  }

  // CSV / Excel — clean columns (Description, Quantity, UnitAmount).
  const g = await readGrid(formData);
  if (!g.ok) return g;
  if (g.cols.name == null) return { ok: false, error: "no_columns" };
  const items = extractRows(g.grid, g.headerIndex, g.cols).map((p) => ({
    line: p.line,
    description: p.raw_name,
    quantity: p.quantity,
    unit_price: p.unit_cost,
  }));
  if (!items.length) return { ok: false, error: "no_items" };
  const rows = matchXero(items.slice(0, ROW_LIMIT), mappingByDesc, skus);
  const meta: XeroMeta = { quote_number: "", date: "", reference: "", customer: "" };
  return { ok: true, source: "csv", meta, rows, truncated: items.length > ROW_LIMIT };
}

const saleSchema = z.object({
  location_id: z.string().uuid(),
  reference: z.string().trim().max(200).optional(),
  customer: z.string().trim().max(300).optional(),
  allow_backorder: z.boolean().optional(),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.coerce.number().int().positive(),
        description: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(ROW_LIMIT),
});

/** Record the confirmed rows as an atomic B2B goods-out, learning mappings. */
export async function importXeroSale(input: unknown): Promise<XeroImportResult> {
  const { sb, error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };

  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const { data, error } = await sb!.rpc("shop_import_xero_sale", {
    p_location: d.location_id,
    p_reference: d.reference || null,
    p_customer: d.customer || null,
    p_items: d.items.map((i) => ({
      variant_id: i.variant_id,
      quantity: i.quantity,
      description: i.description ?? null,
    })),
    p_allow_backorder: d.allow_backorder ?? false,
  });
  if (error) {
    if (error.message.includes("insufficient_stock"))
      return { ok: false, error: "insufficient_stock" };
    if (error.message.includes("duplicate_reference"))
      return {
        ok: false,
        error: "already_imported",
        detail: error.message.split("duplicate_reference:")[1]?.trim() || undefined,
      };
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, count: typeof data === "number" ? data : d.items.length };
}
