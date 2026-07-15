"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { updateWarrantyClaimStatus, type ActionState } from "@/lib/actions";
import {
  WARRANTY_CLAIM_STATUSES,
  type WarrantyClaimStatus,
} from "@/lib/inventory/constants";
import type { WarrantyClaim } from "@/lib/data";
import { cn } from "@/lib/utils";

const toneCls: Record<string, string> = {
  info: "border-info text-info",
  warning: "border-warning text-warning",
  success: "border-success text-success",
  danger: "border-danger text-danger",
  dim: "border-dim text-dim",
};

function statusTone(status: string): string {
  return WARRANTY_CLAIM_STATUSES.find((s) => s.value === status)?.tone ?? "dim";
}

/** Per-row status dropdown; submits to the server action on change. */
function ClaimStatusSelect({
  claimId,
  status,
}: {
  claimId: string;
  status: string;
}) {
  const t = useTranslations("goodsOut");
  const [, action, pending] = useActionState<ActionState, FormData>(
    updateWarrantyClaimStatus,
    null,
  );
  return (
    <form action={action}>
      <input type="hidden" name="claim_id" value={claimId} />
      <select
        name="status"
        defaultValue={status}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-border bg-bg px-2 py-1 text-xs text-fg outline-none focus:border-accent disabled:opacity-50"
      >
        {WARRANTY_CLAIM_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {t(`status_${s.value}` as `status_${WarrantyClaimStatus}`)}
          </option>
        ))}
      </select>
    </form>
  );
}

export function WarrantyClaimsTable({ claims }: { claims: WarrantyClaim[] }) {
  const t = useTranslations("goodsOut");
  const tp = useTranslations("product");
  const tc = useTranslations("common");

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-fg">{t("claimsTitle")}</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm md:min-w-[760px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">{t("colClaimNumber")}</th>
              <th className="px-4 py-3 font-medium">{tp("skuCode")}</th>
              <th className="px-4 py-3 text-right font-medium">{tc("quantity")}</th>
              <th className="px-4 py-3 font-medium">{t("colSupplier")}</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                {t("colSentDate")}
              </th>
              <th className="px-4 py-3 font-medium">{tc("status")}</th>
              <th className="px-4 py-3 font-medium">{t("colAction")}</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr
                key={c.claim_id}
                className="border-b border-border last:border-0 hover:bg-surface-2"
              >
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-info">{c.claim_number}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="sku text-xs">{c.sku_code ?? "—"}</span>
                  {c.product_name && (
                    <span className="mt-0.5 block text-xs text-muted">
                      {c.product_name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">{c.quantity ?? "—"}</td>
                <td className="px-4 py-3 text-fg">{c.supplier_name ?? "—"}</td>
                <td className="hidden px-4 py-3 font-mono text-xs text-muted md:table-cell">
                  {format(new Date(c.sent_at), "dd MMM yyyy")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "font-display inline-flex items-center rounded-full border bg-transparent px-2.5 py-0.5 text-[11px] font-bold",
                      toneCls[statusTone(c.status)],
                    )}
                  >
                    {t(`status_${c.status}` as `status_${WarrantyClaimStatus}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ClaimStatusSelect claimId={c.claim_id} status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {claims.length === 0 && (
          <div className="py-10 text-center text-sm text-muted">{t("noClaims")}</div>
        )}
      </div>
    </div>
  );
}
