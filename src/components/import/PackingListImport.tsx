"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  RotateCcw,
  PackageCheck,
  Loader2,
} from "lucide-react";
import {
  parsePackingList,
  parsePackingListMapped,
} from "@/lib/import-actions";
import { importPackingList } from "@/lib/import-actions";
import type { MatchedRow, SkuLite } from "@/lib/import";
import { cn } from "@/lib/utils";
import { Field, Alert, inputCls } from "@/components/forms/ui";
import { AddSkuDrawer, type CreatedSku } from "./AddSkuDrawer";

type Loc = { location_id: string; name: string };
type Step = "upload" | "mapping" | "review" | "done";

const ERROR_KEYS: Record<string, string> = {
  no_file: "errNoFile",
  too_large: "errTooLarge",
  parse_failed: "errParseFailed",
  empty: "errParseFailed",
  no_rows: "errNoRows",
  unauthorized: "errUnauthorized",
  not_configured: "errNotConfigured",
  invalid_input: "errInvalidInput",
  nothing_selected: "nothingSelected",
  no_location: "errNoLocation",
};

const STATUS_STYLE: Record<
  MatchedRow["status"],
  { cls: string; icon: typeof CheckCircle2; key: string }
> = {
  matched: { cls: "bg-success/15 text-success", icon: CheckCircle2, key: "matched" },
  review: { cls: "bg-warning/15 text-warning", icon: AlertTriangle, key: "review" },
  not_found: { cls: "bg-danger/15 text-danger", icon: XCircle, key: "statusNotFound" },
};

export function PackingListImport({
  skus,
  locations,
}: {
  skus: SkuLite[];
  locations: Loc[];
}) {
  const t = useTranslations("import");
  const tc = useTranslations("common");
  const tf = useTranslations("form");

  const defaultLoc =
    locations.find((l) => /kuningan/i.test(l.name))?.location_id ??
    locations[0]?.location_id ??
    "";

  const [step, setStep] = useState<Step>("upload");
  const [localSkus, setLocalSkus] = useState<SkuLite[]>(skus);
  const existingSkus = useMemo(() => localSkus.map((s) => s.sku_code), [localSkus]);
  const [rows, setRows] = useState<MatchedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [nameCol, setNameCol] = useState<string>("");
  const [qtyCol, setQtyCol] = useState<string>("");
  const [locationId, setLocationId] = useState(defaultLoc);
  const [reference, setReference] = useState("");
  const [fileName, setFileName] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const errMsg = (code: string | null) =>
    code ? t(ERROR_KEYS[code] ?? "errGeneric") : null;

  function currentFileForm(): FormData | null {
    const file = fileRef.current?.files?.[0];
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file);
    return fd;
  }

  function handleParse(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("no_file");
      return;
    }
    setError(null);
    setFileName(file.name);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await parsePackingList(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.needsMapping) {
        setHeaders(res.headers);
        setNameCol(res.autoName != null ? String(res.autoName) : "");
        setQtyCol(res.autoQty != null ? String(res.autoQty) : "");
        setStep("mapping");
        return;
      }
      setRows(res.rows);
      setTruncated(res.truncated);
      setStep("review");
    });
  }

  function applyMapping() {
    if (nameCol === "" || qtyCol === "") {
      setError("invalid_input");
      return;
    }
    const fd = currentFileForm();
    if (!fd) {
      setError("no_file");
      setStep("upload");
      return;
    }
    fd.append("name_col", nameCol);
    fd.append("qty_col", qtyCol);
    setError(null);
    startTransition(async () => {
      const res = await parsePackingListMapped(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.needsMapping) return; // shouldn't happen with explicit columns
      setRows(res.rows);
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
    const s = localSkus.find((x) => x.variant_id === variantId);
    if (!s) return;
    patchRow(i, {
      variant_id: s.variant_id,
      matched_sku: s.sku_code,
      matched_name: s.product_name,
      status: "matched",
      include: (rows[i]?.quantity ?? 0) > 0,
    });
  }

  function onCreatedForRow(i: number, sku: CreatedSku) {
    setLocalSkus((prev) => [...prev, sku]);
    patchRow(i, {
      variant_id: sku.variant_id,
      matched_sku: sku.sku_code,
      matched_name: sku.product_name,
      status: "matched",
      include: (rows[i]?.quantity ?? 0) > 0,
    });
  }

  const summary = useMemo(() => {
    let matched = 0;
    let review = 0;
    let notFound = 0;
    let units = 0;
    let included = 0;
    for (const r of rows) {
      if (r.status === "matched") matched++;
      else if (r.status === "review") review++;
      else notFound++;
      if (r.include && r.variant_id && r.quantity > 0) {
        included++;
        units += r.quantity;
      }
    }
    return { matched, review, notFound, units, included };
  }, [rows]);

  function confirm() {
    const items = rows
      .filter((r) => r.include && r.variant_id && r.quantity > 0)
      .map((r) => ({
        variant_id: r.variant_id as string,
        quantity: r.quantity,
        unit_cost: r.unit_cost,
        description: r.raw_name,
      }));
    if (items.length === 0) {
      setError("nothing_selected");
      return;
    }
    if (!locationId) {
      setError("no_location");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await importPackingList({
        location_id: locationId,
        reference: reference.trim() || `Import packing list — ${fileName}`,
        items,
      });
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
    setHeaders([]);
    setNameCol("");
    setQtyCol("");
    setReference("");
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
      <form onSubmit={handleParse} className="max-w-lg space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-bg/40 p-3">
          <FileSpreadsheet className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>

        <Field label={t("chooseFile")} hint={t("fileHint")}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-90"
          />
        </Field>

        {error && <Alert tone="danger">{errMsg(error)}</Alert>}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
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

  // ------------------------------- Column map ------------------------------
  if (step === "mapping") {
    return (
      <div className="max-w-lg space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t("mapHint")}</span>
        </div>

        <Field label={t("colName")}>
          <select
            value={nameCol}
            onChange={(e) => setNameCol(e.target.value)}
            className={inputCls}
          >
            <option value="">{t("selectColumn")}</option>
            {headers.map((h, i) => (
              <option key={i} value={i}>
                {h || `#${i + 1}`}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("colQty")}>
          <select
            value={qtyCol}
            onChange={(e) => setQtyCol(e.target.value)}
            className={inputCls}
          >
            <option value="">{t("selectColumn")}</option>
            {headers.map((h, i) => (
              <option key={i} value={i}>
                {h || `#${i + 1}`}
              </option>
            ))}
          </select>
        </Field>

        {error && <Alert tone="danger">{errMsg(error)}</Alert>}

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={reset}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
          >
            <ArrowLeft size={16} />
            {tc("cancel")}
          </button>
          <button
            onClick={applyMapping}
            disabled={pending || nameCol === "" || qtyCol === ""}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : null}
            {t("applyMapping")}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------- Done ---------------------------------
  if (step === "done") {
    return (
      <div className="max-w-lg space-y-5 rounded-xl border border-border bg-surface p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
          <PackageCheck className="text-success" size={28} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-fg">{t("doneTitle")}</h2>
          <p className="mt-1 text-sm text-muted">
            {t("importSuccess", { count: doneCount })}
          </p>
        </div>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent hover:bg-surface-2"
        >
          <RotateCcw size={16} />
          {t("importAnother")}
        </button>
      </div>
    );
  }

  // --------------------------------- Review --------------------------------
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <FileSpreadsheet size={16} className="text-accent" />
          <span className="font-medium text-fg">{fileName}</span>
          <span className="text-dim">·</span>
          <span className="text-muted">{t("rowCount", { count: rows.length })}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("destination")}>
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
          </Field>
          <Field label={t("reference")} hint={t("referenceHint")}>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t("referencePlaceholder")}
              className={inputCls}
            />
          </Field>
        </div>

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
      <p className="text-xs text-muted">{t("reviewHint")}</p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">{t("fromFile")}</th>
              <th className="px-3 py-2 font-medium">{t("matchedSku")}</th>
              <th className="px-3 py-2 text-right font-medium">{tc("quantity")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("includeCol")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const st = STATUS_STYLE[r.status];
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
                    <div className="flex items-center gap-1.5">
                      <select
                        value={r.variant_id ?? ""}
                        onChange={(e) => selectSku(i, e.target.value)}
                        className={cn(inputCls, "min-w-[200px] py-1.5")}
                      >
                        <option value="">— {tf("selectSku")} —</option>
                        {localSkus.map((s) => (
                          <option key={s.variant_id} value={s.variant_id}>
                            {s.sku_code} — {s.product_name}
                          </option>
                        ))}
                      </select>
                      {!r.variant_id && (
                        <AddSkuDrawer
                          compact
                          existingSkus={existingSkus}
                          defaultName={r.raw_name}
                          onCreated={(sku) => onCreatedForRow(i, sku)}
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={r.quantity}
                      onChange={(e) =>
                        patchRow(i, {
                          quantity: Math.max(0, Math.round(Number(e.target.value) || 0)),
                        })
                      }
                      className={cn(inputCls, "w-20 py-1.5 text-right")}
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
            {t("toImport", { count: summary.included, units: summary.units })}
          </span>
          <button
            onClick={confirm}
            disabled={pending || summary.included === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <PackageCheck size={16} />
            )}
            {t("confirmImport")}
          </button>
        </div>
      </div>
    </div>
  );
}
