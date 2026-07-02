// Pure helpers for importing a Xero quotation as goods-out (sales):
// position-based row reconstruction from PDF text items, line-item parsing, and
// matching Xero free-text Descriptions to internal SKUs. No server/DB imports.
import { normalize, fuzzyBestVariant, type SkuLite } from "@/lib/import";

export type XeroLine = {
  line: number;
  description: string;
  quantity: number;
  unit_price: number | null;
};

export type XeroMeta = {
  quote_number: string;
  date: string;
  reference: string;
  customer: string;
};

export type XeroMatchStatus = "mapped" | "review" | "not_found";

export type XeroMatchedRow = XeroLine & {
  variant_id: string | null;
  matched_sku: string | null;
  matched_name: string | null;
  status: XeroMatchStatus;
  include: boolean;
};

export type PosItem = { x: number; y: number; s: string };

/** Group positioned text items into visual rows (by y), cells left→right (by x).
 *  Feed items from a SINGLE page; concatenate pages in order to keep them apart. */
export function groupRowsByPosition(items: PosItem[], yTol = 3): string[][] {
  const list = items.filter((i) => i.s && i.s.trim());
  list.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PosItem[][] = [];
  let cur: PosItem[] | null = null;
  let cy = 0;
  for (const it of list) {
    if (cur && Math.abs(it.y - cy) <= yTol) cur.push(it);
    else {
      if (cur) rows.push(cur);
      cur = [it];
    }
    cy = it.y;
  }
  if (cur) rows.push(cur);
  return rows.map((r) =>
    [...r].sort((a, b) => a.x - b.x).map((c) => c.s.trim()),
  );
}

const NUMERIC = /^[\d.,]+$/;
function isNumericCell(s: string): boolean {
  return NUMERIC.test(s) && /\d/.test(s);
}

/** Parse Xero's English number format ("10,368,750.00" → 10368750). */
export function parseMoney(s: string): number {
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const FOOTER = /^(subtotal|sub total|total|terms|term of|amount idr)\b/i;

/** Extract quote metadata + line items from position-reconstructed rows. */
export function parseXeroRows(rows: string[][]): {
  meta: XeroMeta;
  items: XeroLine[];
} {
  const meta: XeroMeta = { quote_number: "", date: "", reference: "", customer: "" };
  const flat = rows.map((r) => r.join(" ")).join("\n");

  const qn = flat.match(/\bQU-?\s?\d{3,}\b/i);
  meta.quote_number = qn ? qn[0].replace(/\s+/g, "").toUpperCase() : "";
  const dt = flat.match(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/);
  meta.date = dt ? dt[0] : "";
  for (const r of rows) {
    for (const c of r) {
      if (!meta.customer && /^(pt\.?|cv\.?|ud\.?|pt |cv )/i.test(c)) {
        meta.customer = c.replace(/[.,]\s*$/, "").trim();
      }
    }
  }
  const refIdx = rows.findIndex((r) => r.some((c) => /^reference$/i.test(c)));
  if (refIdx >= 0) {
    for (let i = refIdx; i < Math.min(rows.length, refIdx + 3); i++) {
      const cand = rows[i].find(
        (c) => !/^reference$/i.test(c) && /[a-z]/i.test(c) && c.length <= 40,
      );
      if (cand) {
        meta.reference = cand.trim();
        break;
      }
    }
  }

  const headerIdx = rows.findIndex((r) => {
    const j = r.map((c) => c.toLowerCase());
    return (
      j.some((c) => c.includes("description")) &&
      j.some((c) => c.includes("quantity") || c.includes("qty")) &&
      j.some((c) => c.includes("price") || c.includes("amount"))
    );
  });

  const items: XeroLine[] = [];
  for (let i = headerIdx >= 0 ? headerIdx + 1 : 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => c.trim()).filter(Boolean);
    if (cells.length === 0) continue;
    if (FOOTER.test(cells[0])) break;

    let k = cells.length;
    while (k > 0 && isNumericCell(cells[k - 1])) k--;
    const descCells = cells.slice(0, k);
    const nums = cells.slice(k);
    if (descCells.length === 0 || nums.length < 2) continue;

    const description = descCells.join(" ").replace(/\s+/g, " ").trim();
    if (description.length < 2) continue;

    items.push({
      line: i + 1,
      description,
      quantity: Math.max(0, Math.round(parseMoney(nums[0]))),
      unit_price: parseMoney(nums[1]) || null,
    });
  }
  return { meta, items };
}

/** Match each Xero line to a SKU: learned mapping → fuzzy candidate → none. */
export function matchXero(
  items: XeroLine[],
  mappingByDesc: Map<string, SkuLite>,
  skus: SkuLite[],
): XeroMatchedRow[] {
  return items.map((it) => {
    const mapped = mappingByDesc.get(normalize(it.description));
    if (mapped) {
      return {
        ...it,
        variant_id: mapped.variant_id,
        matched_sku: mapped.sku_code,
        matched_name: mapped.product_name,
        status: "mapped",
        include: it.quantity > 0,
      };
    }
    const fuzzy = fuzzyBestVariant(it.description, skus, 0.5);
    if (fuzzy) {
      return {
        ...it,
        variant_id: fuzzy.sku.variant_id,
        matched_sku: fuzzy.sku.sku_code,
        matched_name: fuzzy.sku.product_name,
        status: "review",
        include: false,
      };
    }
    return {
      ...it,
      variant_id: null,
      matched_sku: null,
      matched_name: null,
      status: "not_found",
      include: false,
    };
  });
}
