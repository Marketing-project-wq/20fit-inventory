"use client";

import { useTranslations } from "next-intl";
import { format } from "date-fns";
import type { Movement } from "@/lib/data";
import { MovementBadge, MOVEMENT_KEY } from "@/components/badges";

const CHANNEL_LABEL: Record<string, string> = {
  offline: "Offline",
  tokopedia: "Tokopedia",
  shopee: "Shopee",
  b2b_direct: "B2B",
  other: "Other",
};

/*
 * Compact list of the latest goods-in / goods-out movements. Rendered beside the
 * manual entry form so the wide desktop layout no longer leaves the right side
 * empty. `direction` only drives the +/- sign and its colour.
 */
export function RecentMovements({
  movements,
  direction,
}: {
  movements: Movement[];
  direction: "in" | "out";
}) {
  const tf = useTranslations("form");
  const tm = useTranslations("movement");
  const tc = useTranslations("common");

  const fallbackKey = direction === "in" ? "purchaseReceipt" : "sale";

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-muted">
        {direction === "in" ? tf("recentIn") : tf("recentOut")}
      </h2>
      <div className="rounded-xl border border-border bg-surface p-4">
        {movements.length > 0 ? (
          <ul className="space-y-2">
            {movements.map((m) => (
              <li
                key={m.movement_id}
                className="flex items-center gap-3 border-t border-border pt-2 text-sm first:border-0 first:pt-0"
              >
                <MovementBadge
                  type={m.movement_type}
                  label={tm(MOVEMENT_KEY[m.movement_type] ?? fallbackKey)}
                />
                <span className="sku text-xs">{m.sku_code}</span>
                {direction === "out" && m.sales_channel && (
                  <span className="text-xs text-dim">
                    {CHANNEL_LABEL[m.sales_channel] ?? m.sales_channel}
                  </span>
                )}
                <span
                  className={
                    direction === "in"
                      ? "ml-auto font-mono text-success"
                      : "ml-auto font-mono text-danger"
                  }
                >
                  {direction === "in" ? "+" : "-"}
                  {m.quantity}
                </span>
                <span className="w-16 text-right text-xs text-dim">
                  {format(new Date(m.performed_at), "dd MMM")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-8 text-center text-sm text-muted">{tc("noData")}</div>
        )}
      </div>
    </div>
  );
}
