"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItemCondition } from "@/lib/inventory/constants";

export function ConditionToggle({
  value,
  onChange,
}: {
  value: ItemCondition;
  onChange: (c: ItemCondition) => void;
}) {
  const t = useTranslations("goodsIn");
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">
        {t("itemCondition")}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange("good")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors",
            value === "good"
              ? "border-success bg-success/10 text-success"
              : "border-border text-muted hover:text-fg",
          )}
        >
          <CheckCircle2 size={16} />
          {t("conditionGood")}
        </button>
        <button
          type="button"
          onClick={() => onChange("damaged")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors",
            value === "damaged"
              ? "border-danger bg-danger/10 text-danger"
              : "border-border text-muted hover:text-fg",
          )}
        >
          <AlertTriangle size={16} />
          {t("conditionDamaged")}
        </button>
      </div>
      {value === "damaged" && (
        <p className="mt-1 text-xs text-danger">{t("damageWarning")}</p>
      )}
    </div>
  );
}
