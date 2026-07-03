"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Plus, X } from "lucide-react";
import { upsertLocation } from "@/lib/settings-actions";
import type { LocationAdmin } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Field, Alert, inputCls } from "@/components/forms/ui";

const TYPES = ["warehouse", "showroom", "storage", "in-transit"] as const;

function LocationRow({ loc }: { loc: LocationAdmin }) {
  const t = useTranslations("settings");
  const [name, setName] = useState(loc.name);
  const [type, setType] = useState(loc.type);
  const [active, setActive] = useState(loc.is_active);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  const dirty = name !== loc.name || type !== loc.type || active !== loc.is_active;

  function save() {
    if (!name.trim()) return;
    setErr(false);
    start(async () => {
      const res = await upsertLocation({
        location_id: loc.location_id,
        name,
        type,
        is_active: active,
      });
      if (!res.ok) {
        setErr(true);
        return;
      }
      loc.name = name;
      loc.type = type;
      loc.is_active = active;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <tr className={cn("border-t border-border", !active && "opacity-55")}>
      <td className="px-3 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={cn(inputCls, "min-w-[180px] py-1.5")}
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={cn(inputCls, "py-1.5")}
        >
          {TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`locType.${ty}`)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={save}
          disabled={!dirty || pending}
          className={cn(
            "inline-flex h-8 w-16 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
            dirty
              ? "bg-accent text-bg hover:opacity-90"
              : "border border-border text-dim",
            err && "bg-danger text-bg",
          )}
        >
          {pending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : saved ? (
            <Check size={14} />
          ) : (
            t("save")
          )}
        </button>
      </td>
    </tr>
  );
}

export function LocationManager({ locations }: { locations: LocationAdmin[] }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [list, setList] = useState(locations);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("warehouse");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    if (!name.trim()) {
      setError(tc("required"));
      return;
    }
    setError(null);
    start(async () => {
      const res = await upsertLocation({ name, type, is_active: true });
      if (!res.ok) {
        setError(res.error ?? t("genericError"));
        return;
      }
      setList((prev) => [
        ...prev,
        {
          location_id: res.id ?? crypto.randomUUID(),
          name: name.trim(),
          type,
          is_active: true,
        },
      ]);
      setName("");
      setType("warehouse");
      setShowAdd(false);
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          {t("locationCount", { count: list.length })}
        </span>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
        >
          {showAdd ? <X size={15} /> : <Plus size={15} />}
          {t("addLocation")}
        </button>
      </div>

      {showAdd && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("locationName")}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                className={inputCls}
              />
            </Field>
            <Field label={t("locationType")}>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={inputCls}
              >
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`locType.${ty}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <button
            onClick={add}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t("addLocation")}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{t("locationName")}</th>
              <th className="px-3 py-2 font-medium">{t("locationType")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("active")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((l) => (
              <LocationRow key={l.location_id} loc={l} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
