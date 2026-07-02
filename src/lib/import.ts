// Pure helpers for importing a supplier packing list (typically from China):
// column detection over a raw spreadsheet grid, row extraction, and matching
// parsed lines against existing SKUs. No server/DB imports — safe on the client
// and unit-testable.

export type ParsedRow = {
  /** 1-based source row in the sheet, for user reference */
  line: number;
  raw_code: string | null;
  raw_name: string;
  quantity: number;
  unit_cost: number | null;
};

export type SkuLite = {
  variant_id: string;
  sku_code: string;
  product_name: string;
};

export type MatchStatus = "matched" | "review" | "not_found";

export type MatchedRow = ParsedRow & {
  variant_id: string | null;
  matched_sku: string | null;
  matched_name: string | null;
  status: MatchStatus;
  include: boolean;
};

export type Cols = {
  code: number | null;
  name: number | null;
  qty: number | null;
  cartons: number | null;
  per: number | null;
  price: number | null;
};

/** Lowercase, strip every non-alphanumeric char (no spaces) — for header/code matching. */
export function compact(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Lowercase, collapse punctuation to single spaces — for token comparison. */
export function normalize(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: unknown): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

/** Parse a possibly formatted number cell ("1,234", "12 pcs") to a number. */
export function num(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Header keyword banks (compact form). Order of assignment is code → name →
// cartons → per → qty, so the specific "pcs/ctn" column is claimed before the
// generic quantity column.
const HEAD: Record<keyof Cols, string[]> = {
  code: [
    "inventoryitemcode",
    "itemno",
    "itemcode",
    "artno",
    "articleno",
    "sku",
    "model",
    "article",
    "barcode",
    "partno",
    "partnumber",
    "kode",
    "code",
    "refno",
  ],
  name: [
    "description",
    "desc",
    "productname",
    "product",
    "commodity",
    "goods",
    "itemname",
    "nama",
    "namabarang",
    "keterangan",
    "deskripsi",
  ],
  cartons: ["cartons", "carton", "ctns", "ctn", "boxes", "box", "koli", "dus", "packages"],
  per: [
    "pcsctn",
    "pcscarton",
    "pcspercarton",
    "qtyctn",
    "qtyperctn",
    "unitctn",
    "percarton",
    "isi",
  ],
  qty: [
    "totalqty",
    "totalpcs",
    "totalquantity",
    "totalpieces",
    "quantity",
    "qty",
    "pcs",
    "pieces",
    "jumlah",
    "totalunit",
    "units",
  ],
  // Unit price (Xero "UnitAmount"); deliberately avoids bare "amount" so it
  // won't grab a LineAmount / TotalAmount column.
  price: [
    "unitamount",
    "unitprice",
    "priceeach",
    "unitcost",
    "hargasatuan",
    "rate",
    "price",
    "harga",
  ],
};

function headMatch(cell: unknown, keywords: string[]): boolean {
  const h = compact(cell);
  if (!h) return false;
  const toks = new Set(normalize(cell).split(" ").filter(Boolean));
  return keywords.some((k) => {
    if (!k) return false;
    // Long keywords are safe to match anywhere; short/ambiguous ones (e.g. "ctn",
    // "sku", "qty") require a boundary so "ctn" doesn't match "contactname".
    if (k.length >= 5) return h.includes(k);
    return h === k || h.startsWith(k) || toks.has(k);
  });
}

function assign(headerRow: unknown[]): Cols {
  const cols: Cols = {
    code: null,
    name: null,
    cartons: null,
    per: null,
    qty: null,
    price: null,
  };
  const used = new Set<number>();
  const order: (keyof Cols)[] = ["code", "name", "cartons", "per", "qty", "price"];
  for (const cat of order) {
    for (let c = 0; c < headerRow.length; c++) {
      if (used.has(c)) continue;
      if (headMatch(headerRow[c], HEAD[cat])) {
        cols[cat] = c;
        used.add(c);
        break;
      }
    }
  }
  return cols;
}

/**
 * Find the most likely header row (the one matching the most column categories)
 * within the first rows of the sheet, then map columns to fields.
 */
export function detectColumns(grid: unknown[][]): {
  headerIndex: number;
  cols: Cols;
} {
  const scan = Math.min(grid.length, 20);
  let bestRow = -1;
  let bestScore = 0;
  for (let i = 0; i < scan; i++) {
    const row = grid[i] ?? [];
    let cats = 0;
    for (const kws of Object.values(HEAD)) {
      if (row.some((c) => headMatch(c, kws))) cats++;
    }
    if (cats > bestScore) {
      bestScore = cats;
      bestRow = i;
    }
  }
  const headerIndex = bestRow < 0 ? 0 : bestRow;
  return { headerIndex, cols: assign(grid[headerIndex] ?? []) };
}

const SKIP_NAMES = new Set(["total", "grandtotal", "subtotal", "totals", "sum"]);

/** Turn data rows below the header into structured lines. */
export function extractRows(
  grid: unknown[][],
  headerIndex: number,
  cols: Cols,
): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const rawName =
      cols.name != null ? String(row[cols.name] ?? "").trim() : "";
    const rawCode =
      cols.code != null ? String(row[cols.code] ?? "").trim() : "";
    if (!rawName && !rawCode) continue;
    if (rawName && SKIP_NAMES.has(compact(rawName))) continue;

    let q = 0;
    if (cols.qty != null) q = num(row[cols.qty]);
    if (q === 0 && cols.cartons != null && cols.per != null) {
      q = num(row[cols.cartons]) * num(row[cols.per]);
    }
    const price = cols.price != null ? num(row[cols.price]) : 0;
    out.push({
      line: i + 1,
      raw_code: rawCode || null,
      raw_name: rawName || rawCode,
      quantity: Math.max(0, Math.round(q)),
      unit_cost: price > 0 ? price : null,
    });
  }
  return out;
}

function scoreCandidate(row: ParsedRow, sku: SkuLite): number {
  const q = tokens(row.raw_name);
  if (q.length === 0 && !row.raw_code) return 0;
  const target = new Set([...tokens(sku.product_name), ...tokens(sku.sku_code)]);
  let inter = 0;
  for (const x of new Set(q)) if (target.has(x)) inter++;
  let s = q.length ? inter / new Set(q).size : 0;
  if (row.raw_code) {
    const rc = compact(row.raw_code);
    const sc = compact(sku.sku_code);
    if (rc.length >= 2 && sc.length >= 2 && (sc.includes(rc) || rc.includes(sc))) {
      s += 0.5;
    }
  }
  return s;
}

/**
 * Match each parsed line to a SKU:
 *  - exact SKU-code or exact product-name → "matched" (auto-included)
 *  - best fuzzy candidate above threshold → "review" (needs confirmation)
 *  - otherwise → "not_found"
 */
export function matchRows(parsed: ParsedRow[], skus: SkuLite[]): MatchedRow[] {
  const byCode = new Map<string, SkuLite>();
  const byName = new Map<string, SkuLite>();
  for (const s of skus) {
    const c = compact(s.sku_code);
    if (c && !byCode.has(c)) byCode.set(c, s);
    const n = normalize(s.product_name);
    if (n && !byName.has(n)) byName.set(n, s);
  }

  return parsed.map((row) => {
    const base = { ...row };
    // 1) exact code
    if (row.raw_code) {
      const hit = byCode.get(compact(row.raw_code));
      if (hit) return confirmed(base, hit);
    }
    // 2) exact name
    const nameHit = byName.get(normalize(row.raw_name));
    if (nameHit) return confirmed(base, nameHit);

    // 3) fuzzy best candidate
    let best: SkuLite | null = null;
    let bestScore = 0;
    for (const s of skus) {
      const sc = scoreCandidate(row, s);
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    if (best && bestScore >= 0.5) {
      return {
        ...base,
        variant_id: best.variant_id,
        matched_sku: best.sku_code,
        matched_name: best.product_name,
        status: "review",
        include: false,
      };
    }
    return {
      ...base,
      variant_id: null,
      matched_sku: null,
      matched_name: null,
      status: "not_found",
      include: false,
    };
  });
}

/** Best fuzzy SKU for a free-text name (token overlap). Null below `min`. */
export function fuzzyBestVariant(
  text: string,
  skus: SkuLite[],
  min = 0.5,
): { sku: SkuLite; score: number } | null {
  const qset = new Set(tokens(text));
  if (qset.size === 0) return null;
  let best: SkuLite | null = null;
  let bestScore = 0;
  for (const s of skus) {
    const target = new Set([...tokens(s.product_name), ...tokens(s.sku_code)]);
    let inter = 0;
    for (const x of qset) if (target.has(x)) inter++;
    const score = inter / qset.size;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best && bestScore >= min ? { sku: best, score: bestScore } : null;
}

function confirmed(base: ParsedRow, sku: SkuLite): MatchedRow {
  return {
    ...base,
    variant_id: sku.variant_id,
    matched_sku: sku.sku_code,
    matched_name: sku.product_name,
    status: "matched",
    include: base.quantity > 0,
  };
}
