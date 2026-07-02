import type { Sku, RawMovement } from "./data";

const INBOUND = new Set([
  "purchase_receipt",
  "transfer_in",
  "return_in",
  "adjustment_in",
]);
const ONLINE = new Set(["tokopedia", "shopee"]);
const DAY = 86_400_000;

// -------------------------------- Valuation --------------------------------
export type ValuationRow = {
  category: string;
  skus: number;
  units: number;
  cost: number;
  retail: number;
};

export function valuationByCategory(skus: Sku[]) {
  const cats = new Map<string, ValuationRow>();
  for (const s of skus) {
    const key = s.category ?? "—";
    const c =
      cats.get(key) ?? { category: key, skus: 0, units: 0, cost: 0, retail: 0 };
    c.skus++;
    c.units += s.on_hand;
    c.cost += (s.cost_price ?? 0) * s.on_hand;
    c.retail += (s.selling_price ?? 0) * s.on_hand;
    cats.set(key, c);
  }
  const rows = [...cats.values()].sort((a, b) => b.cost - a.cost);
  const total = rows.reduce(
    (t, r) => ({
      units: t.units + r.units,
      cost: t.cost + r.cost,
      retail: t.retail + r.retail,
    }),
    { units: 0, cost: 0, retail: 0 },
  );
  return { rows, total };
}

// ------------------------------ Monthly recap ------------------------------
export type MonthlyRow = {
  sku_code: string;
  product_name: string;
  opening: number;
  goods_in: number;
  offline: number;
  online: number;
  b2b: number;
  other: number;
  closing: number;
};

/** month is 1-12. Opening = net of all movements before the month. */
export function monthlyRecap(
  skus: Sku[],
  movements: RawMovement[],
  year: number,
  month: number,
): MonthlyRow[] {
  const start = Date.UTC(year, month - 1, 1);
  const nextStart = Date.UTC(year, month, 1);
  type Rec = {
    opening: number;
    gin: number;
    offline: number;
    online: number;
    b2b: number;
    other: number;
  };
  const bySku = new Map<string, Rec>();
  for (const s of skus)
    bySku.set(s.variant_id, {
      opening: 0,
      gin: 0,
      offline: 0,
      online: 0,
      b2b: 0,
      other: 0,
    });

  for (const m of movements) {
    const rec = bySku.get(m.variant_id);
    if (!rec) continue;
    const t = new Date(m.performed_at).getTime();
    const inbound = INBOUND.has(m.movement_type);
    if (t < start) {
      rec.opening += inbound ? m.quantity : -m.quantity;
      continue;
    }
    if (t >= nextStart) continue;
    if (inbound) {
      rec.gin += m.quantity;
    } else if (m.movement_type === "sale") {
      const ch = m.sales_channel;
      if (ch === "offline") rec.offline += m.quantity;
      else if (ch && ONLINE.has(ch)) rec.online += m.quantity;
      else if (ch === "b2b_direct") rec.b2b += m.quantity;
      else rec.other += m.quantity;
    } else {
      rec.other += m.quantity; // transfer_out / write_off / adjustment_out
    }
  }

  return skus
    .map((s) => {
      const r = bySku.get(s.variant_id)!;
      const out = r.offline + r.online + r.b2b + r.other;
      return {
        sku_code: s.sku_code,
        product_name: s.product_name,
        opening: r.opening,
        goods_in: r.gin,
        offline: r.offline,
        online: r.online,
        b2b: r.b2b,
        other: r.other,
        closing: r.opening + r.gin - out,
      };
    })
    .filter(
      (r) =>
        r.opening !== 0 ||
        r.goods_in !== 0 ||
        r.offline ||
        r.online ||
        r.b2b ||
        r.other ||
        r.closing !== 0,
    )
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

/** Distinct YYYY-MM present in the ledger, ascending. */
export function monthsWithData(movements: RawMovement[]): string[] {
  return [...new Set(movements.map((m) => m.performed_at.slice(0, 7)))].sort();
}

// ------------------------------- Dead stock --------------------------------
export type DeadRow = {
  sku_code: string;
  product_name: string;
  on_hand: number;
  last_moved: string | null;
  value: number;
};

export function deadStock(
  skus: Sku[],
  movements: RawMovement[],
  days: number,
  nowMs: number,
): DeadRow[] {
  const last = new Map<string, number>();
  for (const m of movements) {
    const t = new Date(m.performed_at).getTime();
    last.set(m.variant_id, Math.max(last.get(m.variant_id) ?? 0, t));
  }
  const cutoff = nowMs - days * DAY;
  return skus
    .filter((s) => s.on_hand > 0 && (last.get(s.variant_id) ?? 0) < cutoff)
    .map((s) => ({
      sku_code: s.sku_code,
      product_name: s.product_name,
      on_hand: s.on_hand,
      last_moved: last.get(s.variant_id)
        ? new Date(last.get(s.variant_id)!).toISOString().slice(0, 10)
        : null,
      value: (s.cost_price ?? 0) * s.on_hand,
    }))
    .sort((a, b) => b.value - a.value);
}

// --------------------------------- Movers ----------------------------------
export type MoverRow = {
  sku_code: string;
  product_name: string;
  sold: number;
  on_hand: number;
};

export function movers(
  skus: Sku[],
  movements: RawMovement[],
  days: number,
  nowMs: number,
) {
  const cutoff = nowMs - days * DAY;
  const sold = new Map<string, number>();
  for (const m of movements) {
    if (m.movement_type === "sale" && new Date(m.performed_at).getTime() >= cutoff) {
      sold.set(m.variant_id, (sold.get(m.variant_id) ?? 0) + m.quantity);
    }
  }
  const rows: MoverRow[] = skus.map((s) => ({
    sku_code: s.sku_code,
    product_name: s.product_name,
    sold: sold.get(s.variant_id) ?? 0,
    on_hand: s.on_hand,
  }));
  const fast = [...rows]
    .filter((r) => r.sold > 0)
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 10);
  const slow = [...rows].sort((a, b) => a.sold - b.sold).slice(0, 10);
  return { fast, slow };
}
