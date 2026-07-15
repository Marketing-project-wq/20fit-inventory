"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Package, RotateCcw, AlertTriangle, type LucideIcon } from "lucide-react";
import type { Movement } from "@/lib/data";
import { StockInForm } from "@/components/forms/StockInForm";
import { RecentMovements } from "@/components/movements/RecentMovements";
import { cn } from "@/lib/utils";
import { ReturnInForm } from "./ReturnInForm";
import { DamageInForm } from "./DamageInForm";
import { ScanPrefillBanner } from "@/components/scan/ScanPrefillBanner";

type Opt = {
  variant_id: string;
  sku_code: string;
  product_name: string;
  cost_price?: number | null;
};
type Loc = { location_id: string; name: string };
type GoodsInType = "normal" | "return" | "damaged";

const TYPES: {
  value: GoodsInType;
  icon: LucideIcon;
  labelKey: string;
  descKey: string;
  active: string;
}[] = [
  { value: "normal", icon: Package, labelKey: "normalReceipt", descKey: "normalReceiptDesc", active: "border-success bg-success/10 text-success" },
  { value: "return", icon: RotateCcw, labelKey: "returnIn", descKey: "returnInDesc", active: "border-info bg-info/10 text-info" },
  { value: "damaged", icon: AlertTriangle, labelKey: "damagedGoods", descKey: "damagedGoodsDesc", active: "border-danger bg-danger/10 text-danger" },
];

export function GoodsInManual({
  skus,
  locations,
  recent,
  preselectVariantId,
}: {
  skus: Opt[];
  locations: Loc[];
  recent: Movement[];
  preselectVariantId?: string;
}) {
  const t = useTranslations("goodsIn");
  const [type, setType] = useState<GoodsInType>("normal");
  const scannedSku = skus.find((s) => s.variant_id === preselectVariantId)?.sku_code;

  return (
    <div className="space-y-5">
      {scannedSku && <ScanPrefillBanner sku={scannedSku} />}
      <div>
        <span className="mb-2 block text-xs font-medium text-muted">
          {t("receiptType")}
        </span>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPES.map((ty) => {
            const activeSel = type === ty.value;
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
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {type === "normal" && (
          <StockInForm
            skus={skus}
            locations={locations}
            preselectVariantId={preselectVariantId}
          />
        )}
        {type === "return" && (
          <ReturnInForm
            skus={skus}
            locations={locations}
            preselectVariantId={preselectVariantId}
          />
        )}
        {type === "damaged" && (
          <DamageInForm
            skus={skus}
            locations={locations}
            preselectVariantId={preselectVariantId}
          />
        )}
        <RecentMovements movements={recent} direction="in" />
      </div>
    </div>
  );
}
