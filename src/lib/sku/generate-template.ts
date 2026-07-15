// Server-only: builds the downloadable SKU import template. Imports xlsx, so
// it must only be used from route handlers / server actions.
import * as XLSX from "xlsx";
import { SKU_TEMPLATE_COLUMNS } from "./template";

type Locale = "id" | "en";

/**
 * Excel template: a data sheet (headers + notes + one example + blank rows) and
 * a "Referensi" sheet listing the valid categories and brands. The community
 * xlsx build can't write cell styles, so this is intentionally plain.
 */
export function generateSkuTemplateXlsx(
  locale: Locale,
  categories: string[],
  brands: string[],
): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const headers = SKU_TEMPLATE_COLUMNS.map((c) =>
    locale === "id" ? c.header_id : c.header,
  );
  const notes = SKU_TEMPLATE_COLUMNS.map((c) => c.note_id);
  const example = SKU_TEMPLATE_COLUMNS.map((c) => c.example);
  const blanks = Array.from({ length: 8 }, () =>
    SKU_TEMPLATE_COLUMNS.map(() => ""),
  );

  const ws = XLSX.utils.aoa_to_sheet([headers, notes, example, ...blanks]);
  ws["!cols"] = SKU_TEMPLATE_COLUMNS.map((c) => ({
    wch:
      c.key === "product_name" || c.key === "product_name_en"
        ? 42
        : c.key === "category"
          ? 28
          : c.key === "sku_code"
            ? 18
            : 16,
  }));
  XLSX.utils.book_append_sheet(wb, ws, "SKU Import");

  const refRows: (string | undefined)[][] = [["KATEGORI", "BRAND"]];
  const max = Math.max(categories.length, brands.length);
  for (let i = 0; i < max; i++) {
    refRows.push([categories[i] ?? "", brands[i] ?? ""]);
  }
  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  wsRef["!cols"] = [{ wch: 34 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsRef, "Referensi");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** Plain CSV template: header row + one example row. */
export function generateSkuTemplateCsv(locale: Locale): string {
  const headers = SKU_TEMPLATE_COLUMNS.map((c) =>
    locale === "id" ? c.header_id : c.header,
  );
  const example = SKU_TEMPLATE_COLUMNS.map((c) =>
    typeof c.example === "string" ? `"${c.example}"` : String(c.example),
  );
  return [headers.join(","), example.join(","), ""].join("\r\n");
}
