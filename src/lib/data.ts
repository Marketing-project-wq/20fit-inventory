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
    .order("performed_at", { ascending: true })
    .limit(10000);
  if (error) return null;

  return { skus: snapshot.skus, movements: (data ?? []) as RawMovement[] };
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

/** Active sales staff for the Transfer / Warehouse Access dropdowns. */
export type SalesStaffOption = { staff_id: string; name: string };

export async function getSalesStaff(): Promise<SalesStaffOption[]> {
  const sb = await createSupabaseServerClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("shop_sales_staff")
    .select("staff_id,name")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) return [];
  return data ?? [];
}

/** Full sales-staff registry for the Settings → Sales Staff tab. */
export type SalesStaff = {
  staff_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export async function getSalesStaffAdmin(): Promise<SalesStaff[] | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("shop_sales_staff")
    .select("staff_id,name,is_active,sort_order")
    .order("sort_order")
    .order("name");
  if (error) return null;
  return data ?? [];
}

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
export type StaffRole = "admin" | "manager" | "staff" | "viewer";
export type StaffMember = {
  staff_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  is_active: boolean;
};

export async function getStaff(): Promise<StaffMember[] | null> {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("shop_staff")
    .select("staff_id,full_name,email,phone,role,is_active")
    .order("full_name");
  if (error) return null;
  return (data ?? []) as StaffMember[];
}

/** The logged-in user's email + their 20FIT Shop role (null if not registered). */
export async function getCurrentStaff(): Promise<{
  email: string;
  role: StaffRole | null;
}> {
  const sb = await createSupabaseServerClient();
  if (!sb) return { email: "", role: null };
  const {
    data: { user },
  } = await sb.auth.getUser();
  const email = user?.email ?? "";
  if (!email) return { email: "", role: null };
  const { data } = await sb
    .from("shop_staff")
    .select("role")
    .eq("email", email)
    .maybeSingle();
  return { email, role: (data?.role as StaffRole) ?? null };
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
