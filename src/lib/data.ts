import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StockStatus = "ok" | "low" | "out";

export type Sku = {
  variant_id: string;
  sku_code: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  cost_price: number | null;
  selling_price: number | null;
  reorder_point: number | null;
  on_hand: number;
  status: StockStatus;
};

export type StockRow = {
  variant_id: string;
  sku_code: string;
  product_name: string;
  location_id: string;
  location_name: string;
  on_hand: number;
  reserved: number;
  available: number;
  status: StockStatus;
};

export type Movement = {
  movement_id: string;
  performed_at: string;
  movement_type: string;
  sku_code: string;
  product_name: string;
  quantity: number;
  unit_cost: number | null;
  sales_channel: string | null;
  reference_type: string | null;
  reason_code: string | null;
  notes: string | null;
};

export type Snapshot = {
  skus: Sku[];
  stockRows: StockRow[];
  locations: { location_id: string; name: string }[];
};

function statusFor(onHand: number, reorder: number | null): StockStatus {
  if (onHand <= 0) return "out";
  if (reorder != null && onHand <= reorder) return "low";
  return "ok";
}

/** Fetch the full inventory snapshot (SKUs + per-location stock), joined in JS. */
export async function getSnapshot(): Promise<Snapshot | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;

  const [variants, products, brands, categories, locations, stock] =
    await Promise.all([
      sb
        .from("shop_product_variants")
        .select(
          "variant_id,product_id,sku_code,cost_price,selling_price,reorder_point",
        ),
      sb.from("shop_products").select("product_id,name,name_en,brand_id,category_id"),
      sb.from("shop_brands").select("brand_id,name"),
      sb.from("shop_categories").select("category_id,name"),
      sb.from("shop_locations").select("location_id,name"),
      sb
        .from("shop_stock_levels")
        .select("variant_id,location_id,quantity_on_hand,quantity_reserved,quantity_available"),
    ]);

  if (variants.error || products.error || stock.error || locations.error) {
    return null;
  }

  const productById = new Map((products.data ?? []).map((p) => [p.product_id, p]));
  const brandById = new Map((brands.data ?? []).map((b) => [b.brand_id, b.name]));
  const catById = new Map((categories.data ?? []).map((c) => [c.category_id, c.name]));
  const locById = new Map((locations.data ?? []).map((l) => [l.location_id, l.name]));
  const variantById = new Map((variants.data ?? []).map((v) => [v.variant_id, v]));

  // Sum on-hand per variant across locations.
  const onHandByVariant = new Map<string, number>();
  for (const s of stock.data ?? []) {
    onHandByVariant.set(
      s.variant_id,
      (onHandByVariant.get(s.variant_id) ?? 0) + (s.quantity_on_hand ?? 0),
    );
  }

  const skus: Sku[] = (variants.data ?? []).map((v) => {
    const p = productById.get(v.product_id);
    const on_hand = onHandByVariant.get(v.variant_id) ?? 0;
    return {
      variant_id: v.variant_id,
      sku_code: v.sku_code,
      product_name: p?.name ?? v.sku_code,
      brand: p ? (brandById.get(p.brand_id) ?? null) : null,
      category: p ? (catById.get(p.category_id) ?? null) : null,
      cost_price: v.cost_price,
      selling_price: v.selling_price,
      reorder_point: v.reorder_point,
      on_hand,
      status: statusFor(on_hand, v.reorder_point),
    };
  });
  skus.sort((a, b) => a.product_name.localeCompare(b.product_name));

  const stockRows: StockRow[] = (stock.data ?? []).map((s) => {
    const v = variantById.get(s.variant_id);
    const p = v ? productById.get(v.product_id) : undefined;
    return {
      variant_id: s.variant_id,
      sku_code: v?.sku_code ?? "—",
      product_name: p?.name ?? "—",
      location_id: s.location_id,
      location_name: locById.get(s.location_id) ?? "—",
      on_hand: s.quantity_on_hand ?? 0,
      reserved: s.quantity_reserved ?? 0,
      available: s.quantity_available ?? 0,
      status: statusFor(s.quantity_on_hand ?? 0, v?.reorder_point ?? null),
    };
  });

  return {
    skus,
    stockRows,
    locations: (locations.data ?? []).map((l) => ({
      location_id: l.location_id,
      name: l.name,
    })),
  };
}

/** Recent stock movements (ledger), newest first. */
export async function getMovements(limit = 100): Promise<Movement[] | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;

  const [movements, variants, products] = await Promise.all([
    sb
      .from("shop_stock_movements")
      .select(
        "movement_id,performed_at,movement_type,variant_id,quantity,unit_cost,sales_channel,reference_type,reason_code,notes",
      )
      .order("performed_at", { ascending: false })
      .limit(limit),
    sb.from("shop_product_variants").select("variant_id,product_id,sku_code"),
    sb.from("shop_products").select("product_id,name"),
  ]);

  if (movements.error || variants.error) return null;

  const productById = new Map((products.data ?? []).map((p) => [p.product_id, p.name]));
  const variantById = new Map((variants.data ?? []).map((v) => [v.variant_id, v]));

  return (movements.data ?? []).map((m) => {
    const v = variantById.get(m.variant_id);
    return {
      movement_id: m.movement_id,
      performed_at: m.performed_at,
      movement_type: m.movement_type,
      sku_code: v?.sku_code ?? "—",
      product_name: v ? (productById.get(v.product_id) ?? "—") : "—",
      quantity: m.quantity,
      unit_cost: m.unit_cost,
      sales_channel: m.sales_channel,
      reference_type: m.reference_type,
      reason_code: m.reason_code,
      notes: m.notes,
    };
  });
}

export type DashboardData = {
  totalInventoryValue: number;
  belowReorder: number;
  outOfStock: number;
  openPurchaseOrders: number;
  watchlist: Sku[];
  recent: Movement[];
};

export async function getDashboard(): Promise<DashboardData | null> {
  const snapshot = await getSnapshot();
  if (!snapshot) return null;
  const recent = (await getMovements(5)) ?? [];

  const totalInventoryValue = snapshot.skus.reduce(
    (sum, s) => sum + (s.cost_price ?? 0) * s.on_hand,
    0,
  );
  const belowReorder = snapshot.skus.filter((s) => s.status === "low").length;
  const outOfStock = snapshot.skus.filter((s) => s.status === "out").length;

  const sb = await createSupabaseServerClient();
  let openPurchaseOrders = 0;
  if (sb) {
    const { count } = await sb
      .from("shop_purchase_orders")
      .select("po_id", { count: "exact", head: true })
      .in("status", ["draft", "submitted", "partially_received"]);
    openPurchaseOrders = count ?? 0;
  }

  const watchlist = [...snapshot.skus]
    .sort((a, b) => a.on_hand - b.on_hand)
    .slice(0, 10);

  return {
    totalInventoryValue,
    belowReorder,
    outOfStock,
    openPurchaseOrders,
    watchlist,
    recent,
  };
}
