"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_ITEM_PHOTO_BYTES } from "@/lib/inventory/constants";

/**
 * Condition photo picker for return/damage forms. Emits a form field named
 * `photo`; the server action uploads it to the private item-photos bucket.
 * `danger` styles the dropzone red for damaged items.
 */
export function ItemPhotoField({
  required = false,
  danger = false,
}: {
  required?: boolean;
  danger?: boolean;
}) {
  const t = useTranslations("goodsIn");
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function clear() {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">
        {t("damagePhotoLabel")}
        {required && <span className="text-danger"> *</span>}
      </span>
      <label
        htmlFor="item-photo"
        className={cn(
          "flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-center transition-colors",
          danger ? "border-danger/50 bg-danger/5" : "border-border bg-surface-2",
        )}
      >
        {preview ? (
          <div className="relative w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={t("damagePhotoLabel")}
              className="max-h-56 w-full rounded object-cover"
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                clear();
              }}
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
              aria-label="remove"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <Camera size={22} className={danger ? "text-danger" : "text-muted"} />
            <span
              className={cn("text-xs font-medium", danger ? "text-danger" : "text-fg")}
            >
              {t("takePhoto")}
            </span>
            <span className="text-xs text-dim">{t("takePhotoHint")}</span>
          </>
        )}
        <input
          id="item-photo"
          ref={inputRef}
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          required={required}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) {
              setPreview(null);
              return;
            }
            if (f.size > MAX_ITEM_PHOTO_BYTES) {
              alert(t("photoTooLarge"));
              clear();
              return;
            }
            setPreview(URL.createObjectURL(f));
          }}
        />
      </label>
    </div>
  );
}
