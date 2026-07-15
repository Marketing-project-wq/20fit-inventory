"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { parseSkuImport, commitSkuImport } from "@/lib/sku-import-actions";
import type { ParsePreview, ImportResult } from "@/lib/sku/import-types";
import { cn } from "@/lib/utils";

type Preview = Extract<ParsePreview, { ok: true }>;
type Step = "idle" | "parsing" | "preview" | "importing" | "done" | "error";

const idr = (n: number | null) => (n == null ? "—" : n.toLocaleString("id-ID"));

export function BulkImportSku({ onImported }: { onImported?: () => void }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tp = useTranslations("product");
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("idle");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function mapErr(code?: string) {
    if (code === "too_large") return t("importTooLarge");
    if (code === "no_file" || code === "parse_failed") return t("importParseFailed");
    if (code === "not_configured") return t("genericError");
    return t("genericError");
  }

  async function onFile(file: File) {
    setFileName(file.name);
    setStep("parsing");
    setErrMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await parseSkuImport(fd);
    if (!res.ok) {
      setErrMsg(mapErr(res.error));
      setStep("error");
      return;
    }
    setPreview(res);
    setStep("preview");
  }

  async function doImport() {
    if (!preview) return;
    const valid = preview.rows.filter((r) => r.action !== "error");
    if (valid.length === 0) return;
    setStep("importing");
    const res = await commitSkuImport(JSON.stringify(valid));
    setResult(res);
    setStep("done");
    if (res.created > 0 || res.updated > 0) onImported?.();
  }

  function reset() {
    setStep("idle");
    setPreview(null);
    setResult(null);
    setErrMsg(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const tmplBtn =
    "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent";

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">{t("bulkImport")}</h3>
          <p className="mt-1 text-sm text-muted">{t("bulkImportDesc")}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/sku/template?format=xlsx&locale=${locale}`} className={tmplBtn}>
            <Download size={14} />
            {t("downloadTemplateXlsx")}
          </a>
          <a href={`/api/sku/template?format=csv&locale=${locale}`} className={tmplBtn}>
            <Download size={14} />
            {t("downloadTemplateCsv")}
          </a>
        </div>
      </div>

      {step === "idle" && (
        <label
          htmlFor="sku-bulk-upload"
          className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface-2 p-4 text-center transition-colors hover:border-accent"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
        >
          <FileSpreadsheet size={26} className="text-muted" />
          <span className="text-sm font-medium text-fg">{t("dropFileHere")}</span>
          <span className="text-xs text-dim">{t("supportedFormats")}</span>
          <input
            id="sku-bulk-upload"
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </label>
      )}

      {(step === "parsing" || step === "importing") && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
          <Loader2 size={18} className="animate-spin text-accent" />
          {step === "parsing" ? t("parsing") : t("importing")}
          {fileName && step === "parsing" && (
            <span className="font-mono text-xs text-dim">{fileName}</span>
          )}
        </div>
      )}

      {step === "preview" && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t("previewTotal"), value: preview.total, cls: "text-fg" },
              { label: t("validRows"), value: preview.valid, cls: "text-success" },
              { label: t("errorRows"), value: preview.errorCount, cls: "text-danger" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-border bg-surface-2 p-3 text-center"
              >
                <div className={cn("font-mono text-2xl font-bold", s.cls)}>{s.value}</div>
                <div className="mt-1 text-xs text-muted">{s.label}</div>
              </div>
            ))}
          </div>

          {preview.errors.length > 0 && (
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-danger/30 bg-danger/5 p-3">
              {preview.errors.map((e, i) => (
                <p
                  key={i}
                  className={cn(
                    "text-xs",
                    e.severity === "error" ? "text-danger" : "text-warning",
                  )}
                >
                  {e.severity === "error" ? "✗" : "⚠"} {tc("row")} {e.rowNum}: {e.message}
                </p>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">{tp("skuCode")}</th>
                  <th className="px-3 py-2 font-medium">{tp("productName")}</th>
                  <th className="px-3 py-2 text-right font-medium">{tp("costPrice")}</th>
                  <th className="px-3 py-2 text-right font-medium">{tp("sellingPrice")}</th>
                  <th className="px-3 py-2 font-medium">{tc("status")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 10).map((r) => (
                  <tr
                    key={r.rowNum}
                    className={cn(
                      "border-t border-border",
                      r.action === "error" && "bg-danger/5",
                    )}
                  >
                    <td className="px-3 py-2">
                      <span className="sku">{r.sku_code || "—"}</span>
                    </td>
                    <td className="px-3 py-2 text-fg">{r.product_name || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{idr(r.cost_price)}</td>
                    <td className="px-3 py-2 text-right font-mono">{idr(r.selling_price)}</td>
                    <td className="px-3 py-2">
                      {r.action === "error" ? (
                        <span className="text-danger">✗ {t("statusError")}</span>
                      ) : r.action === "update" ? (
                        <span className="text-info">↻ {t("statusUpdate")}</span>
                      ) : (
                        <span className="text-success">✓ {t("statusCreate")}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {preview.rows.length > 10 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-center text-dim">
                      {t("andMoreRows", { n: preview.rows.length - 10 })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={reset}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
            >
              {tc("cancel")}
            </button>
            <button
              onClick={doImport}
              disabled={preview.valid === 0}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {t("importNValidSku", { n: preview.valid })}
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-semibold text-success">{t("importDone")}</p>
              <p className="mt-1 text-xs text-muted">
                {t("importSummary", {
                  created: result.created,
                  updated: result.updated,
                  failed: result.failed,
                })}
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-danger">
                      ✗ {e.sku_code}: {e.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={reset}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
          >
            {t("importAnotherFile")}
          </button>
        </div>
      )}

      {step === "error" && (
        <div className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4">
          <AlertCircle size={18} className="shrink-0 text-danger" />
          <p className="flex-1 text-sm text-danger">{errMsg}</p>
          <button onClick={reset} className="text-muted hover:text-fg" aria-label={tc("cancel")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
