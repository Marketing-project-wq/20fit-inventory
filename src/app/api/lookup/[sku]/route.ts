import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/lookup/<sku> — resolve a scanned SKU code to product + live stock.
// Authenticated (reads run as the logged-in user under RLS). Returns everything
// the scan-result view needs so tapping an action can pre-fill Goods In/Out.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
) {
  const { sku } = await params;
  const code = decodeURIComponent(sku).trim();

  const sb = await createSupabaseServerClient();
  if (!sb) return Response.json({ found: false, error: "not_configured" });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user)
    return Response.json({ found: false, error: "unauthorized" }, { status: 401 });

  const { data: variant } = await sb
    .from("shop_product_variants")
    .select(
      "variant_id,sku_code,product_id,cost_price,selling_price,reorder_point,unit_of_measure",
    )
    .eq("sku_code", code)
    .maybeSingle();
  if (!variant) return Response.json({ found: false, code });

  const [product, stock, locations] = await Promise.all([
    sb
      .from("shop_products")
      .select("name, shop_categories(name), shop_brands(name)")
      .eq("product_id", variant.product_id)
      .maybeSingle(),
    // Both conditions — the scan card separates good (sellable) from damaged.
    sb
      .from("shop_stock_levels")
      .select("location_id,condition,quantity_on_hand,quantity_available")
      .eq("variant_id", variant.variant_id),
    sb.from("shop_locations").select("location_id,name,is_primary"),
  ]);

  // Seed every location at 0 so the card can show all warehouses, then fill.
  type LocRow = {
    location_id: string;
    location: string;
    is_primary: boolean;
    good: number;
    damaged: number;
    available: number;
  };
  const byLoc = new Map<string, LocRow>();
  for (const l of locations.data ?? []) {
    byLoc.set(l.location_id, {
      location_id: l.location_id,
      location: l.name,
      is_primary: Boolean(l.is_primary),
      good: 0,
      damaged: 0,
      available: 0,
    });
  }
  for (const s of stock.data ?? []) {
    const row = byLoc.get(s.location_id);
    if (!row) continue;
    if (s.condition === "damaged") {
      row.damaged = s.quantity_on_hand;
    } else {
      row.good = s.quantity_on_hand;
      row.available = s.quantity_available;
    }
  }
  const stockRows = [...byLoc.values()].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.location.localeCompare(b.location),
  );

  const totalGood = stockRows.reduce((sum, r) => sum + r.good, 0);
  const totalDamaged = stockRows.reduce((sum, r) => sum + r.damaged, 0);
  const prod = product.data as
    | {
        name?: string;
        shop_categories?: { name?: string } | null;
        shop_brands?: { name?: string } | null;
      }
    | null;

  return Response.json({
    found: true,
    variant_id: variant.variant_id,
    sku_code: variant.sku_code,
    product_name: prod?.name ?? variant.sku_code,
    category_name: prod?.shop_categories?.name ?? null,
    brand_name: prod?.shop_brands?.name ?? null,
    unit: variant.unit_of_measure ?? "pcs",
    cost_price: variant.cost_price,
    selling_price: variant.selling_price,
    reorder_point: variant.reorder_point,
    total_good: totalGood,
    total_damaged: totalDamaged,
    is_out_of_stock: totalGood === 0,
    is_low_stock:
      variant.reorder_point != null && totalGood <= variant.reorder_point && totalGood > 0,
    stock: stockRows.map((r) => ({
      location: r.location,
      good: r.good,
      damaged: r.damaged,
      available: r.available,
    })),
  });
}
