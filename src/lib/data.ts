import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/roles";

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
  on_hand: number; // sellable (good condition) only
  damaged: number; // separate damaged stock, not sellable
  status: StockStatus;
};

export type StockRow = {
  variant_id: string;
  sku_code: string;
  product_name: string;
  location_id: string;
  location_name: string;
  on_hand: number; // good
  reserved: number;
  available: number;
  damaged: number;
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
  performed_by: string | null;
  performed_by_name: string | null;
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
        .select("variant_id,location_id,condition,quantity_on_hand,quantity_reserved,quantity_available"),
    ]);

  if (variants.error || products.error || stock.error || locations.error) {
    return null;
  }

  const productById = new Map((products.data ?? []).map((p) => [p.product_id, p]));
  const brandById = new Map((brands.data ?? []).map((b) => [b.brand_id, b.name]));
  const catById = new Map((categories.data ?? []).map((c) => [c.category_id, c.name]));
  const locById = new Map((locations.data ?? []).map((l) => [l.location_id, l.name]));
  const variantById = new Map((variants.data ?? []).map((v) => [v.variant_id, v]));

  // Aggregate stock per (variant, location), splitting good vs damaged. Only
  // GOOD stock counts as on-hand / available / sellable.
  type PairAgg = {
    variant_id: string;
    location_id: string;
    good: number;
    reserved: number;
    available: number;
    damaged: number;
  };
  const pairs = new Map<string, PairAgg>();
  const goodByVariant = new Map<string, number>();
  const damagedByVariant = new Map<string, number>();
  for (const s of stock.data ?? []) {
    const key = `${s.variant_id}|${s.location_id}`;
    let agg = pairs.get(key);
    if (!agg) {
      agg = {
        variant_id: s.variant_id,
        location_id: s.location_id,
        good: 0,
        reserved: 0,
        available: 0,
        damaged: 0,
      };
      pairs.set(key, agg);
    }
    const qty = s.quantity_on_hand ?? 0;
    if (s.condition === "damaged") {
      agg.damaged += qty;
      damagedByVariant.set(s.variant_id, (damagedByVariant.get(s.variant_id) ?? 0) + qty);
    } else {
      agg.good += qty;
      agg.reserved += s.quantity_reserved ?? 0;
      agg.available += s.quantity_available ?? 0;
      goodByVariant.set(s.variant_id, (goodByVariant.get(s.variant_id) ?? 0) + qty);
    }
  }

  const skus: Sku[] = (variants.data ?? []).map((v) => {
    const p = productById.get(v.product_id);
    const on_hand = goodByVariant.get(v.variant_id) ?? 0;
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
      damaged: damagedByVariant.get(v.variant_id) ?? 0,
      status: statusFor(on_hand, v.reorder_point),
    };
  });
  skus.sort((a, b) => a.product_name.localeCompare(b.product_name));

  const stockRows: StockRow[] = [...pairs.values()]
    .filter((a) => a.good > 0 || a.damaged > 0)
    .map((a) => {
      const v = variantById.get(a.variant_id);
      const p = v ? productById.get(v.product_id) : undefined;
      return {
        variant_id: a.variant_id,
        sku_code: v?.sku_code ?? "—",
        product_name: p?.name ?? "—",
        location_id: a.location_id,
        location_name: locById.get(a.location_id) ?? "—",
        on_hand: a.good,
        reserved: a.reserved,
        available: a.available,
        damaged: a.damaged,
        status: statusFor(a.good, v?.reorder_point ?? null),
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

type MovementActor = {
  user_id: string;
  email: string | null;
  display_name: string | null;
};

/**
 * Recent stock movements (ledger), newest first.
 *
 * `opts.user` is a server-side, URL-driven filter on the performing user
 * (substring match on display name or email). The performer is
 * `shop_stock_movements.performed_by` (an auth user id); the display name is
 * resolved via `shop_movement_actors()` (a SECURITY DEFINER helper scoped to
 * users who have actually performed a movement) with priority
 * nickname > full_name > email.
 */
export async function getMovements(
  limit = 100,
  opts?: { user?: string },
): Promise<Movement[] | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;

  const { data: actorRows } = await sb.rpc("shop_movement_actors");
  const actors = (actorRows ?? []) as MovementActor[];
  const nameById = new Map(
    actors.map((a) => [a.user_id, a.display_name || a.email || ""]),
  );

  // Resolve the optional user filter to matching performer ids (name or email).
  const userQuery = opts?.user?.trim().toLowerCase();
  let filterIds: string[] | null = null;
  if (userQuery) {
    filterIds = actors
      .filter(
        (a) =>
          (a.display_name ?? "").toLowerCase().includes(userQuery) ||
          (a.email ?? "").toLowerCase().includes(userQuery),
      )
      .map((a) => a.user_id);
    if (filterIds.length === 0) return []; // no actor matches → empty result
  }

  let movementQuery = sb
    .from("shop_stock_movements")
    .select(
      "movement_id,performed_at,movement_type,variant_id,quantity,unit_cost,sales_channel,reference_type,reason_code,notes,performed_by",
    )
    .order("performed_at", { ascending: false })
    .limit(limit);
  if (filterIds) movementQuery = movementQuery.in("performed_by", filterIds);

  const [movements, variants, products] = await Promise.all([
    movementQuery,
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
      performed_by: m.performed_by ?? null,
      performed_by_name: m.performed_by
        ? nameById.get(m.performed_by) || null
        : null,
    };
  });
}

export type DashboardData = {
  totalInventoryValue: number;
  belowReorder: number;
  outOfStock: number;
  openPurchaseOrders: number;
  damagedUnits: number;
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

  const damagedUnits = snapshot.skus.reduce((sum, s) => sum + s.damaged, 0);

  return {
    totalInventoryValue,
    belowReorder,
    outOfStock,
    openPurchaseOrders,
    damagedUnits,
    watchlist,
    recent,
  };
}

// ------------------------------- Reports -----------------------------------
export type RawMovement = {
  variant_id: string;
  movement_type: string;
  quantity: number;
  sales_channel: string | null;
  performed_at: string;
};

/** Minimal movement rows for the dashboard trend chart. */
export async function getTrendMovements(): Promise<
  { movement_type: string; quantity: number; performed_at: string }[] | null
> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("shop_stock_movements")
    .select("movement_type,quantity,performed_at")
    // Trend tracks sellable (good) stock flow; damaged goods are a separate pool.
    .eq("item_condition", "good")
    .order("performed_at", { ascending: true })
    .limit(10000);
  if (error) return null;
  return data ?? [];
}

/** SKUs (with stock + prices) plus the full movement ledger, for reporting. */
export async function getReportSource(): Promise<{
  skus: Sku[];
  movements: RawMovement[];
} | null> {
  const snapshot = await getSnapshot();
  if (!snapshot) return null;
  const sb = await createSupabaseServerClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from("shop_stock_movements")
    .select("variant_id,movement_type,quantity,sales_channel,performed_at")
    // Reports reconcile against good (sellable) on-hand; exclude damaged movements
    // so opening/in/out/closing balances stay consistent with the stock snapshot.
    .eq("item_condition", "good")
    .order("performed_at", { ascending: true })
    .limit(10000);
  if (error) return null;

  return { skus: snapshot.skus, movements: (data ?? []) as RawMovement[] };
}

// ---------------------------- Sales report ---------------------------------
/**
 * One sold unit-line for the Sales Report. The system stores no per-sale price,
 * so revenue/profit are ESTIMATED from the variant's current catalog prices
 * (`selling_price` / `cost_price`) — see the Sales Report page footnote. B2B
 * deals in particular may differ from catalog, so treat figures as estimates.
 */
export type SaleRow = {
  performed_at: string;
  sales_channel: string | null;
  quantity: number;
  selling_price: number;
  cost_price: number;
  sku_code: string;
  product_name: string;
  category: string | null;
};

/**
 * Sale movements in a WIB date range, joined to catalog prices + category, for
 * the Sales Report. Filtering (date range, channel, category) is server-side;
 * `from`/`to` are inclusive WIB calendar days (yyyy-mm-dd) converted to explicit
 * +07:00 instants so Postgres compares them correctly against the UTC column.
 */
export async function getSalesReport(opts: {
  from: string;
  to: string;
  channel?: string;
  category?: string; // category_id
}): Promise<SaleRow[] | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;

  const [variants, products, categories] = await Promise.all([
    sb
      .from("shop_product_variants")
      .select("variant_id,product_id,sku_code,selling_price,cost_price"),
    sb.from("shop_products").select("product_id,name,category_id"),
    sb.from("shop_categories").select("category_id,name"),
  ]);
  if (variants.error || products.error) return null;

  const prodById = new Map((products.data ?? []).map((p) => [p.product_id, p]));
  const catName = new Map((categories.data ?? []).map((c) => [c.category_id, c.name]));
  const variantById = new Map((variants.data ?? []).map((v) => [v.variant_id, v]));

  // Optional category filter → restrict to that category's variant ids.
  let variantFilter: string[] | null = null;
  if (opts.category) {
    const prodIds = new Set(
      (products.data ?? [])
        .filter((p) => p.category_id === opts.category)
        .map((p) => p.product_id),
    );
    variantFilter = (variants.data ?? [])
      .filter((v) => prodIds.has(v.product_id))
      .map((v) => v.variant_id);
    if (variantFilter.length === 0) return [];
  }

  const fromUtc = `${opts.from}T00:00:00.000+07:00`;
  const toUtc = `${opts.to}T23:59:59.999+07:00`;

  let q = sb
    .from("shop_stock_movements")
    .select("variant_id,quantity,sales_channel,performed_at")
    .eq("movement_type", "sale")
    .eq("item_condition", "good")
    .gte("performed_at", fromUtc)
    .lte("performed_at", toUtc)
    .order("performed_at", { ascending: true })
    .limit(10000);
  if (opts.channel) q = q.eq("sales_channel", opts.channel);
  if (variantFilter) q = q.in("variant_id", variantFilter);

  const { data, error } = await q;
  if (error) return null;

  return (data ?? []).map((m) => {
    const v = variantById.get(m.variant_id);
    const p = v ? prodById.get(v.product_id) : undefined;
    return {
      performed_at: m.performed_at,
      sales_channel: m.sales_channel,
      quantity: m.quantity,
      selling_price: v?.selling_price ?? 0,
      cost_price: v?.cost_price ?? 0,
      sku_code: v?.sku_code ?? "—",
      product_name: p?.name ?? "—",
      category: p?.category_id ? (catName.get(p.category_id) ?? null) : null,
    };
  });
}

// -------------------------- Warehouse access -------------------------------
export type AccessLog = {
  log_id: string;
  location_id: string;
  location_name: string;
  visitor_name: string | null;
  sales_staff_name: string | null;
  dw_name: string | null;
  purpose: string | null;
  notes: string | null;
  check_in_at: string;
  check_out_at: string | null;
};

/** Locations for select inputs (lightweight). */
export async function getLocations(): Promise<
  { location_id: string; name: string }[] | null
> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("shop_locations")
    .select("location_id,name")
    .order("name");
  if (error) return null;
  return data ?? [];
}

/** Warehouse check-in/check-out log, newest first. */
export async function getAccessLogs(limit = 100): Promise<AccessLog[] | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;
  const [logs, locations, salesStaff] = await Promise.all([
    sb
      .from("shop_warehouse_access_log")
      .select(
        "log_id,location_id,visitor_name,sales_staff_id,dw_name,purpose,notes,check_in_at,check_out_at",
      )
      .order("check_in_at", { ascending: false })
      .limit(limit),
    sb.from("shop_locations").select("location_id,name"),
    sb.from("shop_sales_staff").select("staff_id,name"),
  ]);
  if (logs.error) return null;
  const locName = new Map((locations.data ?? []).map((l) => [l.location_id, l.name]));
  const staffName = new Map(
    (salesStaff.data ?? []).map((s) => [s.staff_id, s.name]),
  );
  return (logs.data ?? []).map((l) => ({
    log_id: l.log_id,
    location_id: l.location_id,
    location_name: locName.get(l.location_id) ?? "—",
    visitor_name: l.visitor_name,
    sales_staff_name: l.sales_staff_id
      ? (staffName.get(l.sales_staff_id) ?? null)
      : null,
    dw_name: l.dw_name,
    purpose: l.purpose,
    notes: l.notes,
    check_in_at: l.check_in_at,
    check_out_at: l.check_out_at,
  }));
}

/** Recent stock transfers with sales-staff name and a signed proof-photo URL. */
export type RecentTransfer = {
  movement_id: string;
  sku_code: string;
  quantity: number;
  performed_at: string;
  sales_staff_name: string | null;
  dw_name: string | null;
  photo_url: string | null;
};

export async function getRecentTransfers(limit = 12): Promise<RecentTransfer[]> {
  const sb = await createSupabaseServerClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("shop_stock_movements")
    .select(
      "movement_id,variant_id,quantity,performed_at,sales_staff_id,dw_name,photo_url",
    )
    .eq("movement_type", "transfer_out")
    .order("performed_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const variantIds = [...new Set(data.map((m) => m.variant_id))];
  const staffIds = [
    ...new Set(data.map((m) => m.sales_staff_id).filter(Boolean)),
  ] as string[];
  const [variants, salesStaff] = await Promise.all([
    sb.from("shop_product_variants").select("variant_id,sku_code").in("variant_id", variantIds),
    staffIds.length
      ? sb.from("shop_sales_staff").select("staff_id,name").in("staff_id", staffIds)
      : Promise.resolve({ data: [] as { staff_id: string; name: string }[] }),
  ]);
  const skuOf = new Map((variants.data ?? []).map((v) => [v.variant_id, v.sku_code]));
  const nameOf = new Map((salesStaff.data ?? []).map((s) => [s.staff_id, s.name]));

  // Sign the private-bucket paths so thumbnails render (valid 1 hour).
  const paths = data.map((m) => m.photo_url).filter(Boolean) as string[];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await sb.storage
      .from("transfer-photos")
      .createSignedUrls(paths, 3600);
    for (const u of urls ?? []) {
      if (u.signedUrl && u.path) signed.set(u.path, u.signedUrl);
    }
  }

  return data.map((m) => ({
    movement_id: m.movement_id,
    sku_code: skuOf.get(m.variant_id) ?? "—",
    quantity: m.quantity,
    performed_at: m.performed_at,
    sales_staff_name: m.sales_staff_id ? (nameOf.get(m.sales_staff_id) ?? null) : null,
    dw_name: m.dw_name,
    photo_url: m.photo_url ? (signed.get(m.photo_url) ?? null) : null,
  }));
}

// ---------------------------- Warranty claims ------------------------------
export type WarrantyClaim = {
  claim_id: string;
  claim_number: string;
  supplier_name: string | null;
  status: string;
  sent_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  sku_code: string | null;
  product_name: string | null;
  quantity: number | null;
};

/** Warranty claims, newest first, joined to their warranty_out movement (SKU/qty). */
export async function getWarrantyClaims(limit = 100): Promise<WarrantyClaim[] | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;

  const [claims, movements, variants, products] = await Promise.all([
    sb
      .from("shop_warranty_claims")
      .select(
        "claim_id,claim_number,supplier_name,status,sent_at,resolved_at,resolution_notes",
      )
      .order("sent_at", { ascending: false })
      .limit(limit),
    sb
      .from("shop_stock_movements")
      .select("warranty_claim_number,variant_id,quantity")
      .eq("movement_type", "warranty_out"),
    sb.from("shop_product_variants").select("variant_id,product_id,sku_code"),
    sb.from("shop_products").select("product_id,name"),
  ]);
  if (claims.error) return null;

  const productById = new Map((products.data ?? []).map((p) => [p.product_id, p.name]));
  const variantById = new Map((variants.data ?? []).map((v) => [v.variant_id, v]));
  // First warranty_out movement per claim number (one shipment = one claim).
  const mvByClaim = new Map<string, { variant_id: string; quantity: number }>();
  for (const m of movements.data ?? []) {
    if (m.warranty_claim_number && !mvByClaim.has(m.warranty_claim_number)) {
      mvByClaim.set(m.warranty_claim_number, {
        variant_id: m.variant_id,
        quantity: m.quantity,
      });
    }
  }

  return (claims.data ?? []).map((c) => {
    const mv = mvByClaim.get(c.claim_number);
    const v = mv ? variantById.get(mv.variant_id) : undefined;
    return {
      claim_id: c.claim_id,
      claim_number: c.claim_number,
      supplier_name: c.supplier_name,
      status: c.status,
      sent_at: c.sent_at,
      resolved_at: c.resolved_at,
      resolution_notes: c.resolution_notes,
      sku_code: v?.sku_code ?? null,
      product_name: v ? (productById.get(v.product_id) ?? null) : null,
      quantity: mv?.quantity ?? null,
    };
  });
}

// ------------------------------ Activity log -------------------------------
export type AuditLogRow = {
  log_id: string;
  user_email: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  description: string | null;
  module: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  created_at: string;
};

export type AuditLogFilters = {
  search?: string;
  module?: string;
  user?: string;
  from?: string; // yyyy-mm-dd
  to?: string;
};

const AUDIT_COLS =
  "log_id,user_id,user_email,user_name,action,entity_type,description,module,before_value,after_value,created_at";

export const AUDIT_PAGE_SIZE = 50;

/** Paginated audit-log rows for the Activity Log page (newest first). */
export async function getAuditLogs(
  filters: AuditLogFilters,
  page: number,
  pageSize = AUDIT_PAGE_SIZE,
): Promise<{ rows: AuditLogRow[]; total: number } | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;
  let q = sb
    .from("shop_audit_logs")
    .select(AUDIT_COLS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);
  if (filters.module) q = q.eq("module", filters.module);
  if (filters.user) q = q.ilike("user_email", `%${filters.user}%`);
  if (filters.from) q = q.gte("created_at", `${filters.from}T00:00:00`);
  if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59`);
  if (filters.search) q = q.ilike("description", `%${filters.search}%`);
  const [{ data, count, error }, staff] = await Promise.all([
    q,
    sb.from("shop_staff").select("user_id,email,nickname,full_name"),
  ]);
  if (error) return null;

  // Resolve the display name from the shop's own staff (nickname > full_name),
  // falling back to the name/email stored on the log row at write time. Match by
  // user_id first, then email.
  const byUserId = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const s of staff.data ?? []) {
    const name =
      (s.nickname?.trim() || null) ?? (s.full_name?.trim() || null) ?? null;
    if (!name) continue;
    if (s.user_id) byUserId.set(s.user_id, name);
    if (s.email) byEmail.set(s.email.toLowerCase().trim(), name);
  }
  const rows = ((data ?? []) as unknown as (AuditLogRow & {
    user_id: string | null;
  })[]).map((r) => ({
    ...r,
    user_name:
      (r.user_id ? byUserId.get(r.user_id) : undefined) ??
      (r.user_email ? byEmail.get(r.user_email.toLowerCase().trim()) : undefined) ??
      r.user_name,
  }));
  return { rows, total: count ?? 0 };
}

// ------------------------------- Settings ----------------------------------
export type SkuAdmin = {
  variant_id: string;
  sku_code: string;
  product_name: string;
  category_name: string | null;
  cost_price: number | null;
  selling_price: number | null;
  reorder_point: number | null;
  unit_of_measure: string | null;
  is_active: boolean;
};

export type LocationAdmin = {
  location_id: string;
  name: string;
  type: string;
  is_active: boolean;
};

export async function getSkuAdmin(): Promise<SkuAdmin[] | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;
  const [variants, products, categories] = await Promise.all([
    sb
      .from("shop_product_variants")
      .select(
        "variant_id,product_id,sku_code,cost_price,selling_price,reorder_point,unit_of_measure,is_active",
      ),
    sb.from("shop_products").select("product_id,name,category_id"),
    sb.from("shop_categories").select("category_id,name"),
  ]);
  if (variants.error) return null;
  const prodById = new Map((products.data ?? []).map((p) => [p.product_id, p]));
  const catName = new Map((categories.data ?? []).map((c) => [c.category_id, c.name]));
  return (variants.data ?? [])
    .map((v) => {
      const p = prodById.get(v.product_id);
      return {
        variant_id: v.variant_id,
        sku_code: v.sku_code,
        product_name: p?.name ?? v.sku_code,
        category_name: p?.category_id ? (catName.get(p.category_id) ?? null) : null,
        cost_price: v.cost_price,
        selling_price: v.selling_price,
        reorder_point: v.reorder_point,
        unit_of_measure: v.unit_of_measure,
        is_active: v.is_active ?? true,
      };
    })
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

export async function getLocationsAdmin(): Promise<LocationAdmin[] | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("shop_locations")
    .select("location_id,name,type,is_active")
    .order("name");
  if (error) return null;
  return (data ?? []).map((l) => ({
    location_id: l.location_id,
    name: l.name,
    type: l.type,
    is_active: l.is_active ?? true,
  }));
}

export async function getCategories(): Promise<
  { category_id: string; name: string }[]
> {
  const sb = await createSupabaseServerClient();
  if (!sb) return [];
  const { data } = await sb
    .from("shop_categories")
    .select("category_id,name")
    .order("name");
  return data ?? [];
}

export async function getBrands(): Promise<{ brand_id: string; name: string }[]> {
  const sb = await createSupabaseServerClient();
  if (!sb) return [];
  const { data } = await sb.from("shop_brands").select("brand_id,name").order("name");
  return data ?? [];
}

// -------------------------------- Staff ------------------------------------
export type { StaffRole };
export type StaffMember = {
  staff_id: string;
  full_name: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  is_active: boolean;
  last_activity_at: string | null;
  last_login_at: string | null;
};

type StaffLastLogin = {
  user_id: string;
  email: string | null;
  last_sign_in_at: string | null;
};

export async function getStaff(): Promise<StaffMember[] | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;
  const [staff, logins] = await Promise.all([
    sb
      .from("shop_staff")
      .select(
        "staff_id,user_id,full_name,nickname,email,phone,role,is_active,last_activity_at",
      )
      .order("full_name"),
    sb.rpc("shop_staff_last_login"),
  ]);
  if (staff.error) return null;

  // Last login lives in auth.users; resolve it by user_id, falling back to email.
  const loginRows = (logins.data ?? []) as StaffLastLogin[];
  const loginByUserId = new Map(
    loginRows.filter((l) => l.user_id).map((l) => [l.user_id, l.last_sign_in_at]),
  );
  const loginByEmail = new Map(
    loginRows
      .filter((l) => l.email)
      .map((l) => [l.email!.toLowerCase().trim(), l.last_sign_in_at]),
  );

  return (staff.data ?? []).map((s) => ({
    staff_id: s.staff_id,
    full_name: s.full_name,
    nickname: s.nickname ?? null,
    email: s.email ?? null,
    phone: s.phone ?? null,
    role: s.role as StaffRole,
    is_active: s.is_active ?? true,
    last_activity_at: s.last_activity_at ?? null,
    last_login_at:
      (s.user_id ? loginByUserId.get(s.user_id) : null) ??
      (s.email ? loginByEmail.get(s.email.toLowerCase().trim()) : null) ??
      null,
  }));
}

/** The logged-in user's email + nickname + their 20FIT Shop role. `role` is null
 *  when the user has no ACTIVE shop_staff row (unregistered / pending /
 *  deactivated). Matches by user_id (backfilled), falling back to email. */
export async function getCurrentStaff(): Promise<{
  email: string;
  nickname: string | null;
  role: StaffRole | null;
}> {
  const sb = await createSupabaseServerClient();
  if (!sb) return { email: "", nickname: null, role: null };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { email: "", nickname: null, role: null };
  const email = user.email ?? "";
  const cols = "role,is_active,nickname";
  let row = (
    await sb.from("shop_staff").select(cols).eq("user_id", user.id).maybeSingle()
  ).data;
  if (!row && email) {
    row = (
      await sb.from("shop_staff").select(cols).eq("email", email).maybeSingle()
    ).data;
  }
  const role = row && row.is_active ? (row.role as StaffRole) : null;
  return { email, nickname: row?.nickname ?? null, role };
}

/** The logged-in user's display name (nickname > full_name > email), for
 *  pre-filling the "Nama Sales / Penanggung Jawab" field. Empty when unknown. */
export async function getCurrentDisplayName(): Promise<string> {
  const sb = await createSupabaseServerClient();
  if (!sb) return "";
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return "";
  const cols = "nickname,full_name";
  let row = (
    await sb.from("shop_staff").select(cols).eq("user_id", user.id).maybeSingle()
  ).data;
  if (!row && user.email) {
    row = (
      await sb.from("shop_staff").select(cols).eq("email", user.email).maybeSingle()
    ).data;
  }
  return row?.nickname?.trim() || row?.full_name?.trim() || user.email || "";
}

// ----------------------------- Stock opname --------------------------------
export type OpnameSession = {
  session_id: string;
  location_id: string;
  location_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  line_count: number;
  counted_count: number;
};

export type OpnameLine = {
  line_id: string;
  variant_id: string;
  sku_code: string;
  product_name: string;
  expected_qty: number;
  counted_qty: number | null;
  variance: number | null;
};

export async function getOpnameSessions(): Promise<OpnameSession[] | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;
  const [sessions, locations, lines] = await Promise.all([
    sb
      .from("shop_stock_opname_sessions")
      .select("session_id,location_id,status,started_at,completed_at,created_at")
      .order("created_at", { ascending: false }),
    sb.from("shop_locations").select("location_id,name"),
    sb.from("shop_stock_opname_lines").select("session_id,counted_qty"),
  ]);
  if (sessions.error) return null;

  const locName = new Map((locations.data ?? []).map((l) => [l.location_id, l.name]));
  const agg = new Map<string, { total: number; counted: number }>();
  for (const l of lines.data ?? []) {
    const a = agg.get(l.session_id) ?? { total: 0, counted: 0 };
    a.total++;
    if (l.counted_qty != null) a.counted++;
    agg.set(l.session_id, a);
  }
  return (sessions.data ?? []).map((s) => ({
    session_id: s.session_id,
    location_id: s.location_id,
    location_name: locName.get(s.location_id) ?? "—",
    status: s.status,
    started_at: s.started_at,
    completed_at: s.completed_at,
    line_count: agg.get(s.session_id)?.total ?? 0,
    counted_count: agg.get(s.session_id)?.counted ?? 0,
  }));
}

export async function getOpnameSession(
  id: string,
): Promise<{ session: OpnameSession; lines: OpnameLine[] } | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;
  const [session, lines, variants, products, locations] = await Promise.all([
    sb
      .from("shop_stock_opname_sessions")
      .select("session_id,location_id,status,started_at,completed_at")
      .eq("session_id", id)
      .maybeSingle(),
    sb
      .from("shop_stock_opname_lines")
      .select("line_id,variant_id,expected_qty,counted_qty,variance")
      .eq("session_id", id),
    sb.from("shop_product_variants").select("variant_id,product_id,sku_code"),
    sb.from("shop_products").select("product_id,name"),
    sb.from("shop_locations").select("location_id,name"),
  ]);
  if (session.error || !session.data) return null;

  const productById = new Map((products.data ?? []).map((p) => [p.product_id, p.name]));
  const variantById = new Map((variants.data ?? []).map((v) => [v.variant_id, v]));
  const locName = new Map((locations.data ?? []).map((l) => [l.location_id, l.name]));

  const outLines: OpnameLine[] = (lines.data ?? [])
    .map((l) => {
      const v = variantById.get(l.variant_id);
      return {
        line_id: l.line_id,
        variant_id: l.variant_id,
        sku_code: v?.sku_code ?? "—",
        product_name: v ? (productById.get(v.product_id) ?? "—") : "—",
        expected_qty: l.expected_qty,
        counted_qty: l.counted_qty,
        variance: l.variance,
      };
    })
    .sort((a, b) => a.product_name.localeCompare(b.product_name));

  const s = session.data;
  return {
    session: {
      session_id: s.session_id,
      location_id: s.location_id,
      location_name: locName.get(s.location_id) ?? "—",
      status: s.status,
      started_at: s.started_at,
      completed_at: s.completed_at,
      line_count: outLines.length,
      counted_count: outLines.filter((l) => l.counted_qty != null).length,
    },
    lines: outLines,
  };
}
