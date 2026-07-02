import { cn } from "@/lib/utils";
import type { StockStatus } from "@/lib/data";

const stockTone: Record<StockStatus, string> = {
  ok: "bg-success/15 text-success",
  low: "bg-warning/15 text-warning",
  out: "bg-danger/15 text-danger",
};

export function StockBadge({
  status,
  label,
}: {
  status: StockStatus;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        stockTone[status],
      )}
    >
      {label}
    </span>
  );
}

const INBOUND = new Set([
  "purchase_receipt",
  "transfer_in",
  "return_in",
  "adjustment_in",
]);

function movementTone(type: string): string {
  if (type === "write_off") return "bg-danger/15 text-danger";
  if (type === "sale") return "bg-accent-dim text-accent";
  if (INBOUND.has(type)) return "bg-success/15 text-success";
  return "bg-surface-2 text-muted";
}

/** snake_case movement_type -> `movement` i18n key */
export const MOVEMENT_KEY: Record<string, string> = {
  purchase_receipt: "purchaseReceipt",
  sale: "sale",
  transfer_in: "transferIn",
  transfer_out: "transferOut",
  return_in: "returnIn",
  return_out: "returnOut",
  adjustment_in: "adjustmentIn",
  adjustment_out: "adjustmentOut",
  write_off: "writeOff",
};

export function MovementBadge({
  type,
  label,
}: {
  type: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        movementTone(type),
      )}
    >
      {label}
    </span>
  );
}
