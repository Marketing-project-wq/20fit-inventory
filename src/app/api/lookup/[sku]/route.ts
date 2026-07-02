import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/lookup/<sku> — resolve a scanned SKU code to product + live stock.
// Authenticated (reads run as the logged-in user under RLS).
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
    .select("variant_id,sku_code,product_id,cost_price,selling_price")
    .eq("sku_code", code)
    .maybeSingle();
  if (!variant) return Response.json({ found: false, code });

  const [product, stock, locations] = await Promise.all([
    sb
      .from("shop_products")
      .select("name")
      .eq("product_id", variant.product_id)
      .maybeSingle(),
    sb
      .from("shop_stock_levels")
      .select("location_id,quantity_on_hand,quantity_available")
      .eq("variant_id", variant.variant_id),
    sb.from("shop_locations").select("location_id,name"),
  ]);

  const locName = new Map(
    (locations.data ?? []).map((l) => [l.location_id, l.name]),
  );

  return Response.json({
    found: true,
    sku_code: variant.sku_code,
    product_name: product.data?.name ?? variant.sku_code,
    selling_price: variant.selling_price,
    stock: (stock.data ?? []).map((s) => ({
      location: locName.get(s.location_id) ?? "—",
      on_hand: s.quantity_on_hand,
      available: s.quantity_available,
    })),
  });
}
