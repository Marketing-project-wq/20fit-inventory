"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ShoppingCart,
  Wrench,
  Trash2,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import type { Movement } from "@/lib/data";
import { StockOutForm } from "@/components/forms/StockOutForm";
import { RecentMovements } from "@/components/movements/RecentMovements";
import { cn } from "@/lib/utils";
import { WarrantyOutForm, type StockByLoc } from "./WarrantyOutForm";
import { SimpleGoodsOutForm } from "./SimpleGoodsOutForm";

type Opt = { variant_id: string; sku_code: string; product_name: string };
type Loc = { location_id: string; name: string };
type GoodsOutType = "sale" | "warranty" | "disposal" | "return_supplier";

const TYPES: {
  value: GoodsOutType;
  icon: LucideIcon;
  labelKey: string;
  descKey: string;
  stock: "good" | "damaged";
  active: string;
}[] = [
  {
    value: "sale",
    icon: ShoppingCart,
    labelKey: "type_sale",
    descKey: "type_saleDesc",
    stock: "good",
    active: "border-success bg-success/10 text-success",
  },
  {
    value: "warranty",
    icon: Wrench,
    labelKey: "type_warranty",
    descKey: "type_warrantyDesc",
    stock: "damaged",
    active: "border-info bg-info/10 text-info",
  },
  {
    value: "disposal",
    icon: Trash2,
    labelKey: "type_disposal",
    descKey: "type_disposalDesc",
    stock: "damaged",
    active: "border-danger bg-danger/10 text-danger",
  },
  {
    value: "return_supplier",
    icon: RotateCcw,
    labelKey: "type_returnSupplier",
    descKey: "type_returnSupplierDesc",
    stock: "good",
    active: "border-warning bg-warning/10 text-warning",
  },
];

export function GoodsOutManual({
  skus,
  locations,
  recent,
  stockByLoc,
}: {
  skus: Opt[];
  locations: Loc[];
  recent: Movement[];
  stockByLoc: StockByLoc[];
}) {
  const t = useTranslations("goodsOut");
  const [type, setType] = useState<GoodsOutType>("sale");

  return (
    <div className="space-y-5">
      <div>
        <span className="mb-2 block text-xs font-medium text-muted">
          {t("goodsOutType")}
        </span>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {TYPES.map((ty) => {
            const activeSel = type === ty.value;
            const damaged = ty.stock === "damaged";
            return (
              <button
                key={ty.value}
                type="button"
                onClick={() => setType(ty.value)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  activeSel ? ty.active : "border-border bg-surface-2 hover:border-accent",
                )}
              >
                <ty.icon size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold">{t(ty.labelKey)}</p>
                  <p className="mt-0.5 text-xs text-muted">{t(ty.descKey)}</p>
                  <p
                    className={cn(
                      "mt-1.5 text-[11px] font-semibold",
                      damaged ? "text-danger" : "text-success",
                    )}
                  >
                    {t("stockLabel")}: {damaged ? t("stockDamaged") : t("stockGood")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {type === "sale" && <StockOutForm skus={skus} locations={locations} />}
        {type === "warranty" && (
          <WarrantyOutForm skus={skus} locations={locations} stockByLoc={stockByLoc} />
        )}
        {type === "disposal" && (
          <SimpleGoodsOutForm
            kind="disposal"
            skus={skus}
            locations={locations}
            stockByLoc={stockByLoc}
          />
        )}
        {type === "return_supplier" && (
          <SimpleGoodsOutForm
            kind="return_supplier"
            skus={skus}
            locations={locations}
            stockByLoc={stockByLoc}
          />
        )}
        <RecentMovements movements={recent} direction="out" />
      </div>
    </div>
  );
}
