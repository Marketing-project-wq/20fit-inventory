import type { Sku, RawMovement, SaleRow } from "./data";

const INBOUND = new Set([
  "purchase_receipt",
  "transfer_in",
  "return_in",
  "adjustment_in",
]);
const ONLINE = new Set(["tokopedia", "shopee"]);
const DAY = 86_400_000;
const MON = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// --------------------------- Activity trend --------------------------------
export type TrendPoint = { period: string; label: string; masuk: number; keluar: number };

/** Bucket movements into weekly or monthly totals of goods-in vs goods-out. */
export function movementTrend(
  movements: { movement_type: string; quantity: number; performed_at: string }[],
  granularity: "week" | "month",
): TrendPoint[] {
  const buckets = new Map<
    string,
    { label: string; masuk: number; keluar: number; sort: number }
  >();
  for (const m of movements) {
    const d = new Date(m.performed_at);
    if (Number.isNaN(d.getTime())) continue;
    let key: string, label: string, sort: number;
    if (granularity === "month") {
      const y = d.getUTCFullYear();
      const mo = d.getUTCMonth();
      key = `${y}-${String(mo + 1).padStart(2, "0")}`;
      label = `${MON[mo]} ${String(y).slice(2)}`;
      sort = y * 12 + mo;
    } else {
      const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
      const ws = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow),
      );
      key = ws.toISOString().slice(0, 10);
      label = `${ws.getUTCDate()} ${MON[ws.getUTCMonth()]}`;
      sort = ws.getTime();
    }
    const b = buckets.get(key) ?? { label, masuk: 0, keluar: 0, sort };
    if (INBOUND.has(m.movement_type)) b.masuk += m.quantity;
    else b.keluar += m.quantity;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[1].sort - b[1].sort)
    .map(([period, b]) => ({
      period,
      label: b.label,
      masuk: b.masuk,
      keluar: b.keluar,
    }));
}

/**
 * Weeks-of-month breakdown, keyed by YYYY-MM. Each month always yields 4 weeks
 * (Week 1 = days 1–7 … Week 4 = days 22–end); label holds the week number.
 */
export function weekOfMonthTrend(
  movements: { movement_type: string; quantity: number; performed_at: string }[],
): Record<string, TrendPoint[]> {
  const byMonth = new Map<string, TrendPoint[]>();
  for (const m of movements) {
    const d = new Date(m.performed_at);
    if (Number.isNaN(d.getTime())) continue;
    const mkey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const wk = Math.min(4, Math.ceil(d.getUTCDate() / 7)); // 1..4
    let arr = byMonth.get(mkey);
    if (!arr) {
      arr = [1, 2, 3, 4].map((n) => ({
        period: `${mkey}-w${n}`,
        label: String(n),
        masuk: 0,
        keluar: 0,
      }));
      byMonth.set(mkey, arr);
    }
    const pt = arr[wk - 1];
    if (INBOUND.has(m.movement_type)) pt.masuk += m.quantity;
    else pt.keluar += m.quantity;
  }
  return Object.fromEntries(
    [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  );
}

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

// ============================ Sales report =================================
// The business operates in WIB (Asia/Jakarta, UTC+7, no DST). All period
// boundaries and time-series buckets below are computed in WIB by shifting the
// stored UTC instant +7h, then reading its UTC fields as WIB wall-clock. (The
// older reports above intentionally bucket in UTC and are left as-is.)
const WIB_OFFSET = 7 * 60 * 60 * 1000;
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

export type SalesPeriod = { from: string; to: string; days: number };

/**
 * Resolve a preset (today / week / month / year) or a custom from/to pair into a
 * concrete inclusive WIB date range plus its length in days. Falls back to the
 * current WIB month for an unknown preset or an invalid custom range.
 */
export function resolveSalesPeriod(
  preset: string,
  from?: string,
  to?: string,
): SalesPeriod {
  const nowWib = new Date(Date.now() + WIB_OFFSET);
  const y = nowWib.getUTCFullYear();
  const mo = nowWib.getUTCMonth();
  const da = nowWib.getUTCDate();
  const today = ymd(y, mo, da);
  const re = /^\d{4}-\d{2}-\d{2}$/;

  let f = ymd(y, mo, 1);
  let t = today;
  switch (preset) {
    case "today":
      f = today;
      break;
    case "week": {
      const dow = (nowWib.getUTCDay() + 6) % 7; // Monday = 0
      const mon = new Date(Date.UTC(y, mo, da - dow));
      f = ymd(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate());
      break;
    }
    case "year":
      f = ymd(y, 0, 1);
      break;
    case "custom":
      if (from && re.test(from) && to && re.test(to)) {
        f = from;
        t = to;
      }
      break;
    // "month" and anything unexpected use the default (current month).
  }
  if (Date.parse(`${f}T00:00:00Z`) > Date.parse(`${t}T00:00:00Z`)) [f, t] = [t, f];
  const days =
    Math.round(
      (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / DAY,
    ) + 1;
  return { from: f, to: t, days };
}

export type SalesSummary = {
  units: number;
  saleCount: number;
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
};
export type ChannelStat = { channel: string; units: number; revenue: number };
export type CategoryStat = { category: string; units: number; revenue: number };
export type SalesPoint = { period: string; label: string; revenue: number; units: number };
export type SkuStat = {
  sku_code: string;
  product_name: string;
  units: number;
  revenue: number;
};
export type SalesReportData = {
  summary: SalesSummary;
  byChannel: ChannelStat[];
  byCategory: CategoryStat[];
  series: SalesPoint[];
  granularity: "day" | "week" | "month";
  topSkus: SkuStat[];
};

/**
 * Aggregate sale unit-lines into summary totals, per-channel and per-category
 * breakdowns, a WIB-bucketed time series, and top SKUs. Revenue/COGS are
 * estimated from catalog prices already carried on each row. Bucket granularity
 * follows the range length: day ≤ 60d, week ≤ 365d, month beyond.
 */
export function salesAggregate(rows: SaleRow[], rangeDays: number): SalesReportData {
  const granularity: "day" | "week" | "month" =
    rangeDays <= 60 ? "day" : rangeDays <= 365 ? "week" : "month";

  let units = 0;
  let revenue = 0;
  let cogs = 0;
  const chan = new Map<string, ChannelStat>();
  const cat = new Map<string, CategoryStat>();
  const sku = new Map<string, SkuStat>();
  const series = new Map<string, SalesPoint & { sort: number }>();

  for (const r of rows) {
    const rev = (r.selling_price ?? 0) * r.quantity;
    const cost = (r.cost_price ?? 0) * r.quantity;
    units += r.quantity;
    revenue += rev;
    cogs += cost;

    const ch = r.sales_channel || "other";
    const cs = chan.get(ch) ?? { channel: ch, units: 0, revenue: 0 };
    cs.units += r.quantity;
    cs.revenue += rev;
    chan.set(ch, cs);

    const cn = r.category || "—";
    const ct = cat.get(cn) ?? { category: cn, units: 0, revenue: 0 };
    ct.units += r.quantity;
    ct.revenue += rev;
    cat.set(cn, ct);

    const sk =
      sku.get(r.sku_code) ??
      { sku_code: r.sku_code, product_name: r.product_name, units: 0, revenue: 0 };
    sk.units += r.quantity;
    sk.revenue += rev;
    sku.set(r.sku_code, sk);

    const w = new Date(new Date(r.performed_at).getTime() + WIB_OFFSET);
    let key: string;
    let label: string;
    let sort: number;
    if (granularity === "month") {
      const wy = w.getUTCFullYear();
      const wm = w.getUTCMonth();
      key = `${wy}-${pad2(wm + 1)}`;
      label = `${MON[wm]} ${String(wy).slice(2)}`;
      sort = wy * 12 + wm;
    } else if (granularity === "week") {
      const dow = (w.getUTCDay() + 6) % 7;
      const mon = new Date(
        Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() - dow),
      );
      key = ymd(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate());
      label = `${mon.getUTCDate()} ${MON[mon.getUTCMonth()]}`;
      sort = mon.getTime();
    } else {
      key = ymd(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
      label = `${w.getUTCDate()} ${MON[w.getUTCMonth()]}`;
      sort = Date.parse(`${key}T00:00:00Z`);
    }
    const pt =
      series.get(key) ?? { period: key, label, revenue: 0, units: 0, sort };
    pt.revenue += rev;
    pt.units += r.quantity;
    series.set(key, pt);
  }

  const profit = revenue - cogs;
  const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

  return {
    summary: { units, saleCount: rows.length, revenue, cogs, profit, marginPct },
    byChannel: [...chan.values()].sort((a, b) => b.revenue - a.revenue),
    byCategory: [...cat.values()].sort((a, b) => b.revenue - a.revenue),
    series: [...series.values()]
      .sort((a, b) => a.sort - b.sort)
      .map((p) => ({
        period: p.period,
        label: p.label,
        revenue: p.revenue,
        units: p.units,
      })),
    granularity,
    topSkus: [...sku.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
  };
}
