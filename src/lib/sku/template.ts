/**
 * Bulk-import SKU template — single source of truth for the columns used to
 * generate the download template AND to parse an uploaded file.
 *
 * Pure data (no imports) so it is safe to use on client or server.
 */

export type TemplateColumn = {
  key: SkuColumnKey;
  header: string; // English header
  header_id: string; // Indonesian header
  example: string | number;
  required: boolean;
  note_id: string;
};

export type SkuColumnKey =
  | "product_name"
  | "sku_code"
  | "category"
  | "brand"
  | "product_name_en"
  | "cost_price"
  | "selling_price"
  | "unit"
  | "reorder_point";

export const SKU_TEMPLATE_COLUMNS: readonly TemplateColumn[] = [
  {
    key: "product_name",
    header: "Product Name *",
    header_id: "Nama Produk *",
    example: "Competition Octo Kettlebell 16kg",
    required: true,
    note_id: "Wajib. Nama lengkap produk.",
  },
  {
    key: "sku_code",
    header: "SKU Code *",
    header_id: "Kode SKU *",
    example: "20FIT-KB-016",
    required: true,
    note_id: "Wajib. Unik. Format: 20FIT-[KATEGORI]-[SUFFIX]",
  },
  {
    key: "category",
    header: "Category *",
    header_id: "Kategori *",
    example: "Octo Kettlebells",
    required: true,
    note_id: "Wajib. Harus cocok dengan kategori di sistem (lihat sheet Referensi).",
  },
  {
    key: "brand",
    header: "Brand *",
    header_id: "Brand *",
    example: "HYROX",
    required: true,
    note_id: "Wajib. Harus cocok dengan brand di sistem (lihat sheet Referensi).",
  },
  {
    key: "product_name_en",
    header: "Product Name (EN)",
    header_id: "Nama Produk (EN)",
    example: "Competition Octo Kettlebell 16kg",
    required: false,
    note_id: "Opsional. Nama produk Bahasa Inggris.",
  },
  {
    key: "cost_price",
    header: "Cost Price (IDR)",
    header_id: "Harga Modal (IDR)",
    example: 3402000,
    required: false,
    note_id: "Opsional. Rupiah, angka saja (contoh: 3402000).",
  },
  {
    key: "selling_price",
    header: "Selling Price (IDR)",
    header_id: "Harga Jual (IDR)",
    example: 5103000,
    required: false,
    note_id: "Opsional. Rupiah, angka saja (contoh: 5103000).",
  },
  {
    key: "unit",
    header: "Unit",
    header_id: "Satuan",
    example: "pcs",
    required: false,
    note_id: "Opsional. Default: pcs.",
  },
  {
    key: "reorder_point",
    header: "Reorder Point",
    header_id: "Stok Minimum",
    example: 2,
    required: false,
    note_id: "Opsional. Bilangan bulat (contoh: 2).",
  },
] as const;

/** header (any locale, case-insensitive, trimmed) -> canonical key. */
export const HEADER_ALIASES: Record<string, SkuColumnKey> = (() => {
  const m: Record<string, SkuColumnKey> = {};
  const add = (label: string, key: SkuColumnKey) => {
    m[label.toLowerCase().trim()] = key;
  };
  for (const c of SKU_TEMPLATE_COLUMNS) {
    add(c.header, c.key);
    add(c.header.replace(/\s*\*$/, ""), c.key); // without the "*"
    add(c.header_id, c.key);
    add(c.header_id.replace(/\s*\*$/, ""), c.key);
  }
  // A few extra tolerant aliases.
  add("cost price", "cost_price");
  add("selling price", "selling_price");
  add("harga modal", "cost_price");
  add("harga jual", "selling_price");
  add("nama produk en", "product_name_en");
  return m;
})();
