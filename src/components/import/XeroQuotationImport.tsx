"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Upload,
  ReceiptText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  RotateCcw,
  Tag,
  Loader2,
} from "lucide-react";
import {
  parseXeroQuotation,
  updatePricesFromXero,
} from "@/lib/import-actions";
import { matchRows, type MatchedRow, type SkuLite } from "@/lib/import";
import { cn, formatIDR } from "@/lib/utils";
import { Field, Alert, inputCls } from "@/components/forms/ui";

type SkuFull = SkuLite & {
  cost_price: number | null;
  selling_price: number | null;
};
type PriceField = "cost_price" | "selling_price";
type Step = "upload" | "review" | "done";

const ERROR_KEYS: Record<string, string> = {
  no_file: "errNoFile",
  too_large: "errTooLarge",
  parse_failed: "errParseFailed",
  empty: "errParseFailed",
  no_columns: "errNoColumns",
  no_price_column: "errNoPriceColumn",
  no_rows: "errNoRows",
  unauthorized: "errUnauthorized",
  not_configured: "errNotConfigured",
  invalid_input: "errInvalidInput",
  nothing_selected: "nothingSelectedXero",
};

const STATUS_STYLE: Record<
  MatchedRow["status"],
  { cls: string; icon: typeof CheckCircle2; key: string }
> = {
  matched: { cls: "bg-success/15 text-success", icon: CheckCircle2, key: "matched" },
  review: { cls: "bg-warning/15 text-warning", icon: AlertTriangle, key: "review" },
  not_found: { cls: "bg-danger/15 text-danger", icon: XCircle, key: "statusNotFound" },
};

export function XeroQuotationImport({ skus }: { skus: SkuFull[] }) {
  const t = useTranslations("import");
  const tc = useTranslations("common");
  const tf = useTranslations("form");
  const tp = useTranslations("product");

  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<MatchedRow[]>([]);
  const [field, setField] = useState<PriceField>("selling_price");
  const [fileName, setFileName] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const priceOf = useMemo(() => {
    const m = new Map(skus.map((s) => [s.variant_id, s]));
    return (variantId: string | null) =>
      variantId
        ? field === "cost_price"
          ? (m.get(variantId)?.cost_price ?? null)
          : (m.get(variantId)?.selling_price ?? null)
        : null;
  }, [skus, field]);

  const errMsg = (code: string | null) =>
    code ? t(ERROR_KEYS[code] ?? "errGeneric") : null;

  function handleParse(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("no_file");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await parseXeroQuotation(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // A row is included by default only when auto-matched AND it carries a price.
      setRows(
        matchRows(res.rows, skus).map((r) => ({
          ...r,
          include: r.status === "matched" && (r.unit_cost ?? 0) > 0,
        })),
      );
      setFileName(file.name);
      setTruncated(res.truncated);
      setStep("review");
    });
  }

  function patchRow(i: number, patch: Partial<MatchedRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function selectSku(i: number, variantId: string) {
    if (!variantId) {
      patchRow(i, {
        variant_id: null,
        matched_sku: null,
        matched_name: null,
        status: "not_found",
        include: false,
      });
      return;
    }
    const s = skus.find((x) => x.variant_id === variantId);
    if (!s) return;
    patchRow(i, {
      variant_id: s.variant_id,
      matched_sku: s.sku_code,
      matched_name: s.product_name,
      status: "matched",
      include: (rows[i]?.unit_cost ?? 0) > 0,
    });
  }

  const summary = useMemo(() => {
    let matched = 0;
    let review = 0;
    let notFound = 0;
    let included = 0;
    for (const r of rows) {
      if (r.status === "matched") matched++;
      else if (r.status === "review") review++;
      else notFound++;
      if (r.include && r.variant_id && (r.unit_cost ?? 0) > 0) included++;
    }
    return { matched, review, notFound, included };
  }, [rows]);

  function confirm() {
    const items = rows
      .filter((r) => r.include && r.variant_id && (r.unit_cost ?? 0) > 0)
      .map((r) => ({
        variant_id: r.variant_id as string,
        price: r.unit_cost as number,
      }));
    if (items.length === 0) {
      setError("nothing_selected");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updatePricesFromXero({ field, items });
      if (!res.ok) {
        setError(res.error ?? "generic");
        return;
      }
      setDoneCount(res.count ?? items.length);
      setStep("done");
    });
  }

  function reset() {
    setRows([]);
    setFileName("");
    setTruncated(false);
    setError(null);
    setDoneCount(0);
    setStep("upload");
    if (fileRef.current) fileRef.current.value = "";
  }

  // --------------------------------- Upload --------------------------------
  if (step === "upload") {
    return (
      <form
        onSubmit={handleParse}
        className="mx-auto max-w-lg space-y-5 rounded-xl border border-border bg-surface p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-dim">
            <ReceiptText className="text-accent" size={20} />
          </span>
          <p className="text-sm text-muted">{t("xeroSubtitle")}</p>
        </div>

        <Field label={t("xeroChooseFile")} hint={t("fileHint")}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-bg hover:file:opacity-90"
          />
        </Field>

        {error && <Alert tone="danger">{errMsg(error)}</Alert>}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}
          {pending ? tc("loading") : t("parse")}
        </button>
      </form>
    );
  }

  // ---------------------------------- Done ---------------------------------
  if (step === "done") {
    return (
      <div className="mx-auto max-w-lg space-y-5 rounded-xl border border-border bg-surface p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
          <Tag className="text-success" size={26} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-fg">{t("doneTitleXero")}</h2>
          <p className="mt-1 text-sm text-muted">
            {t("pricesUpdated", { count: doneCount })}
          </p>
        </div>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent hover:bg-surface-2"
        >
          <RotateCcw size={16} />
          {t("updateAnother")}
        </button>
      </div>
    );
  }

  // --------------------------------- Review --------------------------------
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <ReceiptText size={16} className="text-accent" />
          <span className="font-medium text-fg">{fileName}</span>
          <span className="text-dim">·</span>
          <span className="text-muted">{t("rowCount", { count: rows.length })}</span>
        </div>

        <Field label={t("priceField")}>
          <select
            value={field}
            onChange={(e) => setField(e.target.value as PriceField)}
            className={cn(inputCls, "max-w-xs")}
          >
            <option value="selling_price">{tp("sellingPrice")}</option>
            <option value="cost_price">{tp("costPrice")}</option>
          </select>
        </Field>

        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-success" />
            {t("mappedAuto")}: {summary.matched}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-warning" />
            {t("needsReview")}: {summary.review}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <XCircle size={14} className="text-danger" />
            {t("notFound")}: {summary.notFound}
          </span>
        </p>
      </div>

      {truncated && <Alert tone="danger">{t("truncated")}</Alert>}
      <p className="text-xs text-muted">{t("xeroReviewHint")}</p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">{t("fromFile")}</th>
              <th className="px-3 py-2 font-medium">{t("matchedSku")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("currentPrice")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("priceCol")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("includeCol")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const st = STATUS_STYLE[r.status];
              const current = priceOf(r.variant_id);
              return (
                <tr key={i} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-mono text-xs text-dim">{r.line}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-fg">{r.raw_name}</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      {r.raw_code && (
                        <span className="sku text-xs">{r.raw_code}</span>
                      )}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          st.cls,
                        )}
                      >
                        <st.icon size={11} />
                        {t(st.key)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.variant_id ?? ""}
                      onChange={(e) => selectSku(i, e.target.value)}
                      className={cn(inputCls, "min-w-[220px] py-1.5")}
                    >
                      <option value="">— {tf("selectSku")} —</option>
                      {skus.map((s) => (
                        <option key={s.variant_id} value={s.variant_id}>
                          {s.sku_code} — {s.product_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted">
                    {current != null ? formatIDR(current) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={r.unit_cost ?? 0}
                      onChange={(e) =>
                        patchRow(i, {
                          unit_cost: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className={cn(inputCls, "w-28 py-1.5 text-right font-mono")}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={r.include}
                      disabled={!r.variant_id}
                      onChange={(e) => patchRow(i, { include: e.target.checked })}
                      className="h-4 w-4 accent-accent disabled:opacity-40"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <Alert tone="danger">{errMsg(error)}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={reset}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
        >
          <ArrowLeft size={16} />
          {tc("cancel")}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {t("toUpdate", { count: summary.included })}
          </span>
          <button
            onClick={confirm}
            disabled={pending || summary.included === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Tag size={16} />
            )}
            {t("updatePrices")}
          </button>
        </div>
      </div>
    </div>
  );
}
