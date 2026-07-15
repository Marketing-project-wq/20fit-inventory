import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateSkuTemplateXlsx,
  generateSkuTemplateCsv,
} from "@/lib/sku/generate-template";

export const dynamic = "force-dynamic";

// GET /api/sku/template?format=xlsx|csv&locale=id|en
export async function GET(req: NextRequest) {
  const sb = await createSupabaseServerClient();
  if (!sb) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const locale = req.nextUrl.searchParams.get("locale") === "en" ? "en" : "id";

  if (format === "csv") {
    return new NextResponse(generateSkuTemplateCsv(locale), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="template_import_sku.csv"',
      },
    });
  }

  const [cats, brands] = await Promise.all([
    sb.from("shop_categories").select("name").order("name"),
    sb.from("shop_brands").select("name").order("name"),
  ]);
  const buffer = generateSkuTemplateXlsx(
    locale,
    (cats.data ?? []).map((c) => c.name),
    (brands.data ?? []).map((b) => b.name),
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template_import_sku.xlsx"',
    },
  });
}
