"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  QrCode,
  Camera,
  CameraOff,
  RotateCcw,
  ArrowDownToLine,
  ArrowUpFromLine,
  PackageSearch,
  Loader2,
  XCircle,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn, formatIDR } from "@/lib/utils";
import { StockBadge } from "@/components/badges";

// Result shapes returned by GET /api/lookup/<sku>.
type StockLine = { location: string; on_hand: number; available: number };
type LookupFound = {
  found: true;
  sku_code: string;
  product_name: string;
  selling_price: number | null;
  stock: StockLine[];
};
type LookupResult =
  | LookupFound
  | { found: false; code?: string; error?: string };

const READER_ID = "qr-reader";

type Phase = "ready" | "scanning" | "result" | "error";

export function QrScanner() {
  const t = useTranslations("scan");
  const tp = useTranslations("product");
  const tc = useTranslations("common");

  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // html5-qrcode instance + guards. Refs so the async scan callback never
  // reads stale state and we never double-trigger on one frame.
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);

  const beep = useCallback(() => {
    try {
      const ctx =
        audioRef.current ??
        new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
      audioRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.17);
    } catch {
      /* audio is a nicety, ignore failures */
    }
  }, []);

  const onDecoded = useCallback(
    async (decodedText: string) => {
      if (busyRef.current) return;
      busyRef.current = true;

      beep();
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(80);
      }

      // Freeze the camera while we look the code up and show the result.
      try {
        await scannerRef.current?.pause(true);
      } catch {
        /* pause may throw if already paused */
      }

      const code = decodedText.trim();
      setLoading(true);
      setPhase("result");
      try {
        const res = await fetch(`/api/lookup/${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as LookupResult;
        setResult(data.found ? data : { found: false, code, error: (data as { error?: string }).error });
      } catch {
        setResult({ found: false, code, error: "network" });
      } finally {
        setLoading(false);
      }
    },
    [beep],
  );

  const start = useCallback(async () => {
    setErrorMsg(null);
    setResult(null);
    setPhase("scanning");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = scannerRef.current ?? new Html5Qrcode(READER_ID);
      scannerRef.current = scanner;
      // Prime the audio context on this user gesture (needed on iOS Safari).
      try {
        audioRef.current =
          audioRef.current ??
          new (window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext)();
        void audioRef.current.resume?.();
      } catch {
        /* ignore */
      }
      busyRef.current = false;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        onDecoded,
        () => {
          /* per-frame decode misses are expected; ignore */
        },
      );
    } catch (err) {
      console.error("[qr-scanner] start failed", err);
      setErrorMsg(t("cameraError"));
      setPhase("error");
    }
  }, [onDecoded, t]);

  const stop = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      // isScanning may be undefined on older builds; guard with try/catch.
      await scanner.stop();
    } catch {
      /* already stopped */
    }
    try {
      scanner.clear();
    } catch {
      /* ignore */
    }
  }, []);

  const scanAgain = useCallback(async () => {
    setResult(null);
    busyRef.current = false;
    setPhase("scanning");
    try {
      await scannerRef.current?.resume();
    } catch {
      // If resume fails (e.g. camera released), do a full restart.
      await start();
    }
  }, [start]);

  // Tear the camera down when leaving the page.
  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  const found = result && result.found ? (result as LookupFound) : null;
  const notFound = result && !result.found ? result : null;

  return (
    <div className="mx-auto max-w-md space-y-5">
      {/* Camera viewport. The reader element stays mounted across phases so
          resume() keeps working; it's just collapsed while a result shows. */}
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-border bg-black",
          phase === "result" && "hidden",
        )}
      >
        <div
          id={READER_ID}
          className={cn(
            "relative aspect-square w-full",
            phase === "scanning" ? "block" : "hidden",
          )}
        />

        {(phase === "ready" || phase === "error") && (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-4 bg-surface p-6 text-center">
            {phase === "error" ? (
              <>
                <CameraOff className="text-danger" size={40} />
                <p className="text-sm text-danger">{errorMsg}</p>
                <button
                  onClick={start}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
                >
                  <RotateCcw size={16} />
                  {t("retry")}
                </button>
              </>
            ) : (
              <>
                <QrCode className="text-accent" size={44} />
                <p className="max-w-xs text-sm text-muted">{t("instruction")}</p>
                <button
                  onClick={start}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90"
                >
                  <Camera size={16} />
                  {t("start")}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {phase === "scanning" && (
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            {t("scanning")}
          </p>
          <button
            onClick={() => {
              void stop();
              setPhase("ready");
            }}
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
          >
            <CameraOff size={15} />
            {t("stop")}
          </button>
        </div>
      )}

      {/* Lookup result */}
      {phase === "result" && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
              <Loader2 size={18} className="animate-spin" />
              {tc("loading")}
            </div>
          ) : found ? (
            <div className="space-y-4">
              <div>
                <span className="sku text-xs">{found.sku_code}</span>
                <h2 className="mt-1.5 text-lg font-semibold text-fg">
                  {found.product_name}
                </h2>
                {found.selling_price != null && (
                  <p className="mt-0.5 font-mono text-sm text-muted">
                    {formatIDR(found.selling_price)}
                  </p>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("stockByLocation")}
                </h3>
                {found.stock.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="pb-1.5 font-medium">{tc("location")}</th>
                        <th className="pb-1.5 text-right font-medium">
                          {tp("stockOnHand")}
                        </th>
                        <th className="pb-1.5 text-right font-medium">
                          {tc("available")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {found.stock.map((s) => (
                        <tr key={s.location} className="border-t border-border">
                          <td className="py-1.5 text-fg">{s.location}</td>
                          <td className="py-1.5 text-right font-mono">
                            {s.on_hand}
                          </td>
                          <td className="py-1.5 text-right">
                            <StockBadge
                              status={
                                s.available <= 0
                                  ? "out"
                                  : s.available <= 3
                                    ? "low"
                                    : "ok"
                              }
                              label={String(s.available)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-3 text-center text-sm text-muted">
                    {tc("noData")}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <ActionLink
                  href="/barang-masuk"
                  icon={ArrowDownToLine}
                  label={t("receive")}
                />
                <ActionLink
                  href="/barang-keluar"
                  icon={ArrowUpFromLine}
                  label={t("issue")}
                />
                <ActionLink
                  href="/produk"
                  icon={PackageSearch}
                  label={t("detail")}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <XCircle className="text-warning" size={32} />
              <p className="text-sm font-medium text-fg">
                {notFound?.error === "network"
                  ? t("lookupError")
                  : notFound?.error === "unauthorized"
                    ? t("unauthorized")
                    : t("notFound")}
              </p>
              {notFound?.code && !notFound.error && (
                <p className="text-xs text-muted">
                  {t("notFoundHint", { code: notFound.code })}
                </p>
              )}
            </div>
          )}

          <button
            onClick={scanAgain}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-semibold text-fg transition-colors hover:border-accent hover:bg-surface-2"
          >
            <RotateCcw size={16} />
            {t("scanAgain")}
          </button>
        </div>
      )}
    </div>
  );
}

function ActionLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof ArrowDownToLine;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-bg p-3 text-center text-xs font-medium text-fg transition-colors hover:border-accent hover:bg-surface-2"
    >
      <Icon size={18} className="text-accent" />
      {label}
    </Link>
  );
}
