// Pure parser for CENTR (Health In Motion) Sales Order PDFs.
// Input is the positioned-text rows extracted from the PDF (one string[] per
// visual row, cells x-sorted), the same shape groupRowsByPosition() returns.
//
// Observed layout (SO187729 & SO194878): each item is a header row
//   [qty]  $[rate]  $[amount]  [ITEM_CODE]
// followed by the product name on the next line(s). Freight / Customer Deposit
// rows are ignored. Header/footer boilerplate repeats on every page.

export type CentrSoItem = {
  centr_item_code: string;
  item_name: string;
  quantity: number;
  unit_price_usd: number;
  amount_usd: number;
};

export type CentrSoMeta = {
  so_number: string;
  date: string; // ISO yyyy-mm-dd
  po_number: string;
  total_usd: number;
};

export type CentrSoParsed = {
  meta: CentrSoMeta;
  items: CentrSoItem[];
  freight_usd: number;
  warnings: string[];
};

const MONEY = /^\$([\d,]+\.\d{2})$/;
const num = (s: string) => Number(s.replace(/[$,]/g, ""));

// A row is an item header when exactly one cell is a bare positive integer
// (qty), two cells are $amounts (rate, amount) and the rest form the code.
function asItemHeader(cells: string[]) {
  const ints: number[] = [];
  const money: number[] = [];
  const rest: string[] = [];
  for (const c of cells) {
    if (/^\d+$/.test(c)) ints.push(Number(c));
    else if (MONEY.test(c)) money.push(num(c));
    else rest.push(c);
  }
  if (ints.length !== 1 || money.length < 2 || rest.length === 0) return null;
  const qty = ints[0];
  if (qty <= 0) return null;
  // rate is the smaller of the two money values, amount the larger (amount = qty*rate).
  const [rate, amount] = money[0] <= money[1] ? [money[0], money[1]] : [money[1], money[0]];
  return { qty, rate, amount, code: rest.join(" ").trim() };
}

const SKIP_CODE = /^(freight|customer deposit)/i;
const NOISE =
  /health in motion|sales order|carriage|norco|phone|^fax|bill to|ship to|sales rep|ordered|^\d+ of \d+$|^so\d+$|subtotal|tax total|^total$|account|routing|swift|company number|customer deposit|consolidation fee|kredo|indonesia|jakarta|projected ship|shipping method|^terms$|pre pay|deposit required/i;

function isNoise(line: string) {
  return !line || NOISE.test(line);
}

export function parseCentrRows(rows: string[][]): CentrSoParsed {
  const warnings: string[] = [];
  const lines = rows.map((r) => r.join(" ").replace(/\s+/g, " ").trim());

  // ── Meta ──────────────────────────────────────────────────────────────
  const flat = lines.join("\n");
  const so_number = flat.match(/#?(SO\d{4,})/i)?.[1]?.toUpperCase() ?? "";
  const dateRaw = flat.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  const date = dateRaw ? `${dateRaw[3]}-${dateRaw[1]}-${dateRaw[2]}` : "";
  // PO # sits on the "Sales Rep | PO# | Shipping | Terms" data row; grab the
  // token after the sales rep name, before "Pre Pay".
  const poLine = lines.find((l) => /pre pay/i.test(l) && /,/.test(l));
  let po_number = "";
  if (poLine) {
    const m = poLine.match(/,\s*[^|]*?\s+([A-Z0-9][A-Z0-9/\-.]{3,})\s+Pre Pay/i);
    po_number = m?.[1]?.trim() ?? "";
  }
  // Grand total: prefer the explicit "Total $x" line, else the largest $ figure.
  const totalMatch = flat.match(/\bTotal\b\s*\$?([\d,]+\.\d{2})/i);
  const total_usd = totalMatch ? num(totalMatch[1]) : 0;

  // ── Items ─────────────────────────────────────────────────────────────
  const items: CentrSoItem[] = [];
  let freight_usd = 0;
  for (let i = 0; i < rows.length; i++) {
    const hdr = asItemHeader(rows[i]);
    if (!hdr) continue;
    if (SKIP_CODE.test(hdr.code)) {
      freight_usd += hdr.amount;
      continue;
    }
    // Name = the following non-header, non-noise line(s), up to 2.
    const nameParts: string[] = [];
    for (let j = i + 1; j < rows.length && nameParts.length < 2; j++) {
      if (asItemHeader(rows[j])) break;
      const l = lines[j];
      if (isNoise(l)) break;
      nameParts.push(l);
    }
    items.push({
      centr_item_code: hdr.code,
      item_name: nameParts.join(" ").trim() || hdr.code,
      quantity: hdr.qty,
      unit_price_usd: hdr.rate,
      amount_usd: hdr.amount,
    });
  }

  if (items.length === 0) {
    warnings.push("no_items_parsed");
  }

  return { meta: { so_number, date, po_number, total_usd }, items, freight_usd, warnings };
}
