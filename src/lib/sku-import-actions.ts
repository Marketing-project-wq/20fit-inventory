"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/import-server";
import { HEADER_ALIASES, type SkuColumnKey } from "@/lib/sku/template";
import type {
  ImportRow,
  RowError,
  ParsePreview,
  ImportResult,
} from "@/lib/sku/import-types";

const MAX_BYTES = 5_000_000;
const MAX_ROWS = 1000;
const SKU_RE = /^20FIT-[A-Z0-9]+-[A-Z0-9]+$/;

const cell = (v: unknown) => String(v ?? "").trim();
function parseMoney(v: unknown): number | null {
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  return digits === "" ? null : Number(digits);
}

/** True for the template's own notes/example rows so they aren't imported. */
function isTemplateArtifact(sku: string, name: string, category: string): boolean {
  if (/^(Wajib|Opsional|Required|Optional)/i.test(sku)) return true;
  if (
    sku === "20FIT-KB-016" &&
    /Competition Octo Kettlebell 16kg/i.test(name) &&
    /Octo Kettlebells/i.test(category)
  )
    return true;
  return false;
}

/** Read the uploaded xlsx/csv into rows keyed by our canonical column keys. */
function readRows(buf: Uint8Array): Record<SkuColumnKey, string>[] | null {
  let grid: unknown[][];
  try {
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return null;
    grid = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    }) as unknown[][];
  } catch {
    return null;
  }
  if (!grid.length) return [];

  const headerRow = grid[0].map((h) => HEADER_ALIASES[cell(h).toLowerCase()]);
  const out: Record<SkuColumnKey, string>[] = [];
  for (let r = 1; r < grid.length; r++) {
    const row = {} as Record<SkuColumnKey, string>;
    let any = false;
    grid[r].forEach((v, c) => {
      const key = headerRow[c];
      if (key) {
        row[key] = cell(v);
        if (row[key]) any = true;
      }
    });
    if (any) out.push(row);
  }
  return out;
}

export async function parseSkuImport(formData: FormData): Promise<ParsePreview> {
  const { sb, error: authErr } = await requireUser();
  if (authErr) return { ok: false, error: authErr };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "no_file" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };

  const raw = readRows(new Uint8Array(await file.arrayBuffer()));
  if (raw === null) return { ok: false, error: "parse_failed" };

  const [cats, brands, variants] = await Promise.all([
    sb!.from("shop_categories").select("name"),
    sb!.from("shop_brands").select("name"),
    sb!.from("shop_product_variants").select("sku_code"),
  ]);
  const catSet = new Set((cats.data ?? []).map((c) => c.name.toLowerCase()));
  const brandSet = new Set((brands.data ?? []).map((b) => b.name.toLowerCase()));
  const existing = new Set(
    (variants.data ?? []).map((v) => v.sku_code.toUpperCase()),
  );

  const rows: ImportRow[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  let rowNum = 3; // header + notes + example occupy the first rows of the template

  for (const r of raw) {
    rowNum++;
    const product_name = r.product_name ?? "";
    const sku_code = (r.sku_code ?? "").toUpperCase();
    const category = r.category ?? "";
    const brand = r.brand ?? "";
    if (!product_name && !sku_code) continue;
    if (isTemplateArtifact(sku_code, product_name, category)) continue;
    if (rows.length >= MAX_ROWS) {
      errors.push({ rowNum, message: `Melebihi batas ${MAX_ROWS} baris.`, severity: "error" });
      break;
    }

    const rowErrors: string[] = [];
    if (!product_name) rowErrors.push("Nama Produk kosong");
    if (!sku_code) rowErrors.push("Kode SKU kosong");
    else if (!SKU_RE.test(sku_code))
      rowErrors.push(`SKU "${sku_code}" tidak sesuai format 20FIT-[KATEGORI]-[SUFFIX]`);
    else if (seen.has(sku_code)) rowErrors.push(`SKU "${sku_code}" duplikat di dalam file`);
    if (!category) rowErrors.push("Kategori kosong");
    else if (!catSet.has(category.toLowerCase()))
      rowErrors.push(`Kategori "${category}" tidak ada di sistem`);
    if (!brand) rowErrors.push("Brand kosong");
    else if (!brandSet.has(brand.toLowerCase()))
      rowErrors.push(`Brand "${brand}" tidak ada di sistem`);
    if (sku_code) seen.add(sku_code);

    const cost_price = parseMoney(r.cost_price);
    const selling_price = parseMoney(r.selling_price);
    const reorderDigits = String(r.reorder_point ?? "").replace(/[^\d]/g, "");
    const reorder_point = reorderDigits === "" ? null : Number(reorderDigits);

    for (const m of rowErrors) errors.push({ rowNum, message: m, severity: "error" });
    if (rowErrors.length === 0 && cost_price == null && selling_price == null) {
      errors.push({
        rowNum,
        message: `SKU "${sku_code}" tidak punya harga modal maupun harga jual`,
        severity: "warning",
      });
    }

    const isUpdate = existing.has(sku_code);
    rows.push({
      rowNum,
      product_name,
      sku_code,
      category,
      brand,
      product_name_en: (r.product_name_en ?? "") || null,
      cost_price,
      selling_price,
      unit: (r.unit ?? "") || "pcs",
      reorder_point,
      action: rowErrors.length > 0 ? "error" : isUpdate ? "update" : "create",
    });
  }

  const errorCount = rows.filter((r) => r.action === "error").length;
  return {
    ok: true,
    rows,
    errors,
    total: rows.length,
    valid: rows.length - errorCount,
    toCreate: rows.filter((r) => r.action === "create").length,
    toUpdate: rows.filter((r) => r.action === "update").length,
    errorCount,
  };
}

export async function commitSkuImport(rowsJson: string): Promise<ImportResult> {
  const { sb, error: authErr } = await requireUser();
  if (authErr)
    return { ok: false, created: 0, updated: 0, failed: 0, errors: [], error: authErr };

  let incoming: ImportRow[];
  try {
    incoming = JSON.parse(rowsJson);
  } catch {
    return { ok: false, created: 0, updated: 0, failed: 0, errors: [], error: "invalid_input" };
  }
  if (!Array.isArray(incoming) || incoming.length === 0 || incoming.length > MAX_ROWS)
    return { ok: false, created: 0, updated: 0, failed: 0, errors: [], error: "invalid_input" };

  // Re-resolve categories/brands server-side — never trust the client payload.
  const [cats, brands] = await Promise.all([
    sb!.from("shop_categories").select("category_id,name"),
    sb!.from("shop_brands").select("brand_id,name"),
  ]);
  const catMap = new Map((cats.data ?? []).map((c) => [c.name.toLowerCase(), c.category_id]));
  const brandMap = new Map((brands.data ?? []).map((b) => [b.name.toLowerCase(), b.brand_id]));

  const res: ImportResult = { ok: true, created: 0, updated: 0, failed: 0, errors: [] };

  for (const row of incoming) {
    const sku = String(row.sku_code ?? "").trim().toUpperCase();
    try {
      if (!sku || !SKU_RE.test(sku)) throw new Error("SKU tidak valid");
      if (!row.product_name?.trim()) throw new Error("Nama produk kosong");
      const category_id = catMap.get(String(row.category ?? "").toLowerCase());
      const brand_id = brandMap.get(String(row.brand ?? "").toLowerCase());
      if (!category_id) throw new Error("Kategori tidak ditemukan");
      if (!brand_id) throw new Error("Brand tidak ditemukan");

      const { data: existing } = await sb!
        .from("shop_product_variants")
        .select("variant_id")
        .eq("sku_code", sku)
        .maybeSingle();

      if (existing) {
        // Existing SKU: refresh variant-level fields only.
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (row.cost_price != null) patch.cost_price = row.cost_price;
        if (row.selling_price != null) patch.selling_price = row.selling_price;
        if (row.reorder_point != null) patch.reorder_point = row.reorder_point;
        if (row.unit) patch.unit_of_measure = row.unit;
        const { error } = await sb!
          .from("shop_product_variants")
          .update(patch)
          .eq("variant_id", existing.variant_id);
        if (error) throw new Error(error.message);
        res.updated++;
      } else {
        const { error } = await sb!.rpc("shop_create_sku", {
          p_name: row.product_name.trim(),
          p_name_en: row.product_name_en ?? null,
          p_sku_code: sku,
          p_category: category_id,
          p_brand: brand_id,
          p_cost: row.cost_price ?? null,
          p_selling: row.selling_price ?? null,
          p_reorder: row.reorder_point ?? null,
          p_unit: row.unit || "pcs",
        });
        if (error) throw new Error(error.message.includes("sku_exists") ? "SKU sudah ada" : error.message);
        res.created++;
      }
    } catch (e) {
      res.failed++;
      res.errors.push({ sku_code: sku || "?", message: e instanceof Error ? e.message : "error" });
    }
  }

  if (res.created > 0 || res.updated > 0) revalidatePath("/", "layout");
  return res;
}
