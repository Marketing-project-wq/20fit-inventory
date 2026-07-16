"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createSalesStaff,
  renameSalesStaff,
  toggleSalesStaff,
  deleteSalesStaff,
} from "@/lib/settings-actions";
import type { SalesStaff } from "@/lib/data";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/forms/ui";

function errText(t: (k: string) => string, code?: string): string {
  return code === "name_exists"
    ? t("salesStaffExists")
    : code === "in_use"
      ? t("salesStaffInUse")
      : t("genericError");
}

function StaffRow({
  staff,
  onRemoved,
}: {
  staff: SalesStaff;
  onRemoved: (id: string) => void;
}) {
  const t = useTranslations("settings");
  const [name, setName] = useState(staff.name);
  const [active, setActive] = useState(staff.is_active);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function saveName() {
    const next = name.trim();
    if (!next || next === staff.name) {
      setEditing(false);
      setName(staff.name);
      return;
    }
    setErr(null);
    start(async () => {
      const res = await renameSalesStaff({ staff_id: staff.staff_id, name: next });
      if (!res.ok) {
        setErr(errText(t, res.error));
        return;
      }
      staff.name = next;
      setEditing(false);
    });
  }

  function toggle() {
    const next = !active;
    setActive(next);
    start(async () => {
      const res = await toggleSalesStaff({ staff_id: staff.staff_id, is_active: next });
      if (res.ok) staff.is_active = next;
      else setActive(!next);
    });
  }

  function remove() {
    if (!confirm(t("salesStaffDeleteConfirm", { name: staff.name }))) return;
    setErr(null);
    start(async () => {
      const res = await deleteSalesStaff({ staff_id: staff.staff_id });
      if (res.ok) onRemoved(staff.staff_id);
      else setErr(errText(t, res.error));
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2",
        !active && "opacity-55",
      )}
    >
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveName();
            if (e.key === "Escape") {
              setEditing(false);
              setName(staff.name);
            }
          }}
          className={cn(inputCls, "py-1.5")}
        />
      ) : (
        <span className="flex-1 text-sm font-medium text-fg">{staff.name}</span>
      )}

      {err && <span className="text-xs text-danger">{err}</span>}

      {editing ? (
        <>
          <button
            onClick={saveName}
            disabled={pending}
            className="text-success transition-opacity hover:opacity-80"
            aria-label={t("save")}
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setName(staff.name);
            }}
            className="text-muted transition-colors hover:text-fg"
            aria-label={t("cancel")}
          >
            <X size={16} />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={toggle}
            disabled={pending}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
              active
                ? "border-success text-success"
                : "border-border text-muted",
            )}
          >
            {active ? t("salesStaffActive") : t("salesStaffInactive")}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="text-muted transition-colors hover:text-fg"
            aria-label={t("edit")}
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={remove}
            disabled={pending}
            className="text-muted transition-colors hover:text-danger"
            aria-label={t("delete")}
          >
            <Trash2 size={15} />
          </button>
        </>
      )}
    </div>
  );
}

export function SalesStaffManager({ staff }: { staff: SalesStaff[] }) {
  const t = useTranslations("settings");
  const [list, setList] = useState(staff);
  const [newName, setNewName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    const name = newName.trim();
    if (!name) return;
    setErr(null);
    start(async () => {
      const res = await createSalesStaff({ name });
      if (!res.ok) {
        setErr(errText(t, res.error));
        return;
      }
      setList((prev) => [
        ...prev,
        {
          staff_id: res.id ?? crypto.randomUUID(),
          name,
          is_active: true,
          sort_order: prev.length + 1,
        },
      ]);
      setNewName("");
    });
  }

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-muted">{t("salesStaffDesc")}</p>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t("salesStaffPlaceholder")}
          maxLength={120}
          className={inputCls}
        />
        <button
          onClick={add}
          disabled={pending || !newName.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          {t("addSalesStaff")}
        </button>
      </div>

      {err && <p className="text-sm text-danger">{err}</p>}

      {list.length > 0 ? (
        <div className="space-y-2">
          {list.map((s) => (
            <StaffRow
              key={s.staff_id}
              staff={s}
              onRemoved={(id) => setList((prev) => prev.filter((x) => x.staff_id !== id))}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted">
          {t("noSalesStaff")}
        </div>
      )}
    </div>
  );
}
