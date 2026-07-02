"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveOpnameCounts, type ActionState } from "@/lib/actions";
import type { OpnameLine } from "@/lib/data";
import { Alert } from "./ui";
import { cn } from "@/lib/utils";

export function OpnameCountForm({
  sessionId,
  lines,
}: {
  sessionId: string;
  lines: OpnameLine[];
}) {
  const t = useTranslations("form");
  const tp = useTranslations("product");
  const tc = useTranslations("common");
  const to = useTranslations("opname");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveOpnameCounts,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="session_id" value={sessionId} />
      {state?.ok && <Alert tone="success">{t("saved")}</Alert>}
      {state && !state.ok && <Alert tone="danger">{t("invalidInput")}</Alert>}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">{tp("skuCode")}</th>
              <th className="px-4 py-3 font-medium">{tp("productName")}</th>
              <th className="px-4 py-3 text-right font-medium">{to("expected")}</th>
              <th className="px-4 py-3 text-right font-medium">{to("counted")}</th>
              <th className="px-4 py-3 text-right font-medium">{to("variance")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.line_id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <span className="sku">{l.sku_code}</span>
                </td>
                <td className="px-4 py-2 text-muted">{l.product_name}</td>
                <td className="px-4 py-2 text-right font-mono">{l.expected_qty}</td>
                <td className="px-4 py-2 text-right">
                  <input
                    name={`count_${l.line_id}`}
                    type="number"
                    min={0}
                    defaultValue={l.counted_qty ?? ""}
                    className="w-20 rounded-md border border-border bg-bg px-2 py-1 text-right font-mono text-sm outline-none focus:border-accent"
                  />
                </td>
                <td
                  className={cn(
                    "px-4 py-2 text-right font-mono",
                    l.counted_qty == null || l.variance === 0
                      ? "text-muted"
                      : (l.variance ?? 0) > 0
                        ? "text-success"
                        : "text-danger",
                  )}
                >
                  {l.counted_qty == null
                    ? "—"
                    : (l.variance ?? 0) > 0
                      ? `+${l.variance}`
                      : l.variance}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-semibold text-fg transition hover:border-accent disabled:opacity-50"
      >
        {pending ? tc("loading") : to("saveCounts")}
      </button>
    </form>
  );
}
