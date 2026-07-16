"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, Info, Loader2, CheckCircle2, Upload } from "lucide-react";
import {
  parseCentrSoFile,
  importCentrSo,
  saveCentrMapping,
  type CentrReviewRow,
} from "@/lib/centr-actions";
import type { CentrSoMeta } from "@/lib/centr";
import { inputCls } from "@/components/forms/ui";
import { cn } from "@/lib/utils";

type Opt = { variant_id: string; sku_code: string; product_name: string };
type Loc = { location_id: string; name: string };
type Step = "idle" | "parsing" | "review" | "importing" | "done";

export function CentrSoImport({
  skus,
  locations,
}: {
  skus: Opt[];
  locations: Loc[];
}) {
  const t = useTranslations("centr");
  const tc = useTranslations("common");
  const [step, setStep] = useState<Step>("idle");
  const [meta, setMeta] = useState<CentrSoMeta | null>(null);
  const [rows, setRows] = useState<CentrReviewRow[]>([]);
  const [locationId, setLocationId] = useState(locations[0]?.location_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const matched = rows.filter((r) => r.matched);
  const unmatched = rows.length - matched.length;

  async function onFile(file: File) {
    setStep("parsing");
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await parseCentrSoFile(fd);
    if (!res.ok) {
      setError(res.error);
      setStep("idle");
      return;
    }
    setMeta(res.meta);
    setRows(res.rows);
    setStep("review");
  }

  function onManualMatch(i: number, variantId: string) {
    const sku = skus.find((s) => s.variant_id === variantId);
    if (!sku) return;
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === i
          ? {
              ...r,
              variant_id: variantId,
              sku_code: sku.sku_code,
              product_name: sku.product_name,
              matched: true,
            }
          : r,
      ),
    );
    // Learn the mapping so the next SO resolves it automatically.
    void saveCentrMapping({
      centr_item_code: rows[i].centr_item_code,
      centr_item_name: rows[i].item_name,
      variant_id: variantId,
    });
  }

  async function onConfirm() {
    if (!locationId || matched.length === 0) return;
    setStep("importing");
    const res = await importCentrSo({
      location_id: locationId,
      so_number: meta?.so_number,
      items: matched.map((r) => ({
        variant_id: r.variant_id,
        quantity: r.quantity,
        centr_item_code: r.centr_item_code,
        unit_price_usd: r.unit_price_usd,
      })),
    });
    if (!res.ok) {
      setError(res.error ?? "error");
      setStep("review");
      return;
    }
    setResult({ count: res.count ?? matched.length, skipped: unmatched });
    setStep("done");
  }

  function reset() {
    setStep("idle");
    setMeta(null);
    setRows([]);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Idle: upload ─────────────────────────────────────────────────────
  if (step === "idle") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 p-3 text-xs text-warning">
          <Info size={15} className="mt-0.5 shrink-0" />
          <span>{t("intro")}</span>
        </div>
        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {t.has(`err_${error}`) ? t(`err_${error}`) : t("err_generic")}
          </div>
        )}
        <label
          htmlFor="centr-so"
          className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-warning/50 bg-warning/5 py-10 text-center transition-colors hover:bg-warning/10"
        >
          <FileText size={26} className="text-warning" />
          <div>
            <p className="text-sm font-semibold text-warning">{t("uploadTitle")}</p>
            <p className="mt-1 text-xs text-dim">{t("uploadHint")}</p>
          </div>
          <input
            id="centr-so"
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </label>
      </div>
    );
  }

  // ── Parsing ──────────────────────────────────────────────────────────
  if (step === "parsing") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-4 text-sm text-muted">
        <Loader2 size={18} className="animate-spin text-warning" />
        {t("parsing")}
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────
  if (step === "done" && result) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-semibold text-success">
              {t("doneTitle", { so: meta?.so_number ?? "" })}
            </p>
            <p className="mt-1 text-xs text-muted">
              {t("doneSummary", { count: result.count, skipped: result.skipped })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-fg transition hover:border-accent"
        >
          {t("importAnother")}
        </button>
      </div>
    );
  }

  // ── Review / importing ───────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {t(`err_${error}`, { defaultValue: t("err_generic") })}
        </div>
      )}

      {/* SO meta */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: t("colSo"), value: meta?.so_number },
          { label: t("colPo"), value: meta?.po_number },
          { label: t("colDate"), value: meta?.date },
        ].map((m) => (
          <div key={m.label} className="rounded-lg bg-surface-2 px-3 py-2">
            <p className="text-xs text-muted">{m.label}</p>
            <p className="mt-0.5 truncate font-mono text-sm text-fg">{m.value || "—"}</p>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("statTotal")} value={rows.length} tone="text-fg" />
        <Stat label={t("statMatched")} value={matched.length} tone="text-success" />
        <Stat
          label={t("statUnmatched")}
          value={unmatched}
          tone={unmatched > 0 ? "text-warning" : "text-dim"}
        />
      </div>

      {/* Location */}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{t("location")}</span>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className={inputCls}
        >
          {locations.map((l) => (
            <option key={l.location_id} value={l.location_id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      {/* Review table */}
      <div className="max-h-96 overflow-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-border text-left text-muted">
              <th className="px-3 py-2 font-medium">{t("thCode")}</th>
              <th className="px-3 py-2 font-medium">{t("thName")}</th>
              <th className="px-3 py-2 text-right font-medium">{tc("quantity")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("thUsd")}</th>
              <th className="px-3 py-2 font-medium">{t("thSku")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.centr_item_code}-${i}`}
                className={cn(
                  "border-b border-border last:border-0",
                  !r.matched && "bg-warning/5",
                )}
              >
                <td className="px-3 py-2 font-mono text-warning">{r.centr_item_code}</td>
                <td className="max-w-52 px-3 py-2 text-fg">{r.item_name}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-fg">
                  {r.quantity}
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted">
                  ${r.unit_price_usd.toFixed(2)}
                </td>
                <td className="px-3 py-2">
                  {r.matched ? (
                    <span className="sku text-xs">{r.sku_code}</span>
                  ) : (
                    <select
                      defaultValue=""
                      onChange={(e) => onManualMatch(i, e.target.value)}
                      className="w-full rounded-lg border border-warning/50 bg-bg px-2 py-1 text-xs text-fg outline-none focus:border-accent"
                    >
                      <option value="" disabled>
                        {t("pickSku")}
                      </option>
                      {skus.map((s) => (
                        <option key={s.variant_id} value={s.variant_id}>
                          {s.sku_code} — {s.product_name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-fg transition hover:border-accent"
        >
          {tc("cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={step === "importing" || matched.length === 0 || !locationId}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {step === "importing" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Upload size={15} />
          )}
          {t("confirm", { count: matched.length })}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-center">
      <div className={cn("font-mono text-2xl font-bold", tone)}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}
