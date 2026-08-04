// Server-only helpers shared by the import Server Actions (packing list + Xero).
// NOT a "use server" module — it exports plain helpers, so importing xlsx here
// never leaks into a client bundle (only server action files import this).
import * as XLSX from "xlsx";
import { detectColumns, type Cols } from "@/lib/import";
import { requireRole } from "@/lib/auth";

export const MAX_BYTES = 5_000_000;
export const ROW_LIMIT = 1000;

/** Import/settings helper: requires an ACTIVE shop_staff row of at least
 *  `staff` (viewers/pending/unregistered → `forbidden`). */
export async function requireUser() {
  const g = await requireRole("staff");
  if (g.error) return { sb: null, error: g.error };
  return { sb: g.sb, error: null as null };
}

/** Read an uploaded .xlsx/.xls/.csv into a raw 2-D grid + detected columns. */
export async function readGrid(
  formData: FormData,
  fieldName = "file",
): Promise<
  | { ok: true; grid: unknown[][]; cols: Cols; headerIndex: number; sheetName: string }
  | { ok: false; error: string }
> {
  const file = formData.get(fieldName);
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
