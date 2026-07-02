"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Download, X } from "lucide-react";
import { useTranslations } from "next-intl";

/** Mini QR (always visible) that opens a large, downloadable QR — PRD signature element. */
export function QRCodeCell({ sku }: { sku: string }) {
  const t = useTranslations("product");
  const src = (size: number, extra = "") =>
    `/api/qr/${encodeURIComponent(sku)}?size=${size}${extra}`;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          className="rounded-md border border-border bg-white p-0.5 transition hover:border-accent"
          title={t("qrCode")}
          aria-label={`QR ${sku}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src(80)} alt={`QR ${sku}`} width={36} height={36} className="block" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold text-fg">
              {t("qrCode")}
            </Dialog.Title>
            <Dialog.Close
              className="text-muted transition-colors hover:text-fg"
              aria-label="Close"
            >
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="mt-4 flex justify-center rounded-lg bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(280)} alt={`QR ${sku}`} width={240} height={240} />
          </div>
          <div className="mt-3 text-center">
            <span className="sku text-sm">{sku}</span>
          </div>

          <div className="mt-5 flex gap-2">
            <a
              href={src(600, "&download=1")}
              download
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
            >
              <Download size={16} /> PNG
            </a>
            <a
              href={src(600, "&format=svg&download=1")}
              download
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-fg transition hover:bg-surface-2"
            >
              <Download size={16} /> SVG
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
