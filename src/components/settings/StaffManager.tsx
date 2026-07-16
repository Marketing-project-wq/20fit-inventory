"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Plus, Trash2, X, ShieldAlert } from "lucide-react";
import { upsertStaff, deleteStaff } from "@/lib/settings-actions";
import type { StaffMember, StaffRole } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Field, Alert, inputCls } from "@/components/forms/ui";

const ROLES: StaffRole[] = ["admin", "manager", "staff", "viewer"];

function StaffRow({
  staff,
  canManage,
  onRemoved,
}: {
  staff: StaffMember;
  canManage: boolean;
  onRemoved: (id: string) => void;
}) {
  const t = useTranslations("settings");
  const [name, setName] = useState(staff.full_name);
  const [email, setEmail] = useState(staff.email ?? "");
  const [role, setRole] = useState<StaffRole>(staff.role);
  const [active, setActive] = useState(staff.is_active);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty =
    name !== staff.full_name ||
    email !== (staff.email ?? "") ||
    role !== staff.role ||
    active !== staff.is_active;

  function save() {
    if (!name.trim()) return;
    setErr(null);
    start(async () => {
      const res = await upsertStaff({
        staff_id: staff.staff_id,
        full_name: name,
        email,
        role,
        is_active: active,
      });
      if (!res.ok) {
        setErr(res.error ?? "generic");
        return;
      }
      staff.full_name = name;
      staff.email = email || null;
      staff.role = role;
      staff.is_active = active;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  function remove() {
    if (!confirm(t("confirmDeleteStaff"))) return;
    start(async () => {
      const res = await deleteStaff({ staff_id: staff.staff_id });
      if (res.ok) onRemoved(staff.staff_id);
      else setErr(res.error ?? "generic");
    });
  }

  if (!canManage) {
    return (
      <tr className={cn("border-t border-border", !staff.is_active && "opacity-55")}>
        <td className="px-3 py-2 text-fg">{staff.full_name}</td>
        <td className="hidden px-3 py-2 text-muted sm:table-cell">
          {staff.email ?? "—"}
        </td>
        <td className="px-3 py-2 text-muted">{t(`role_${staff.role}`)}</td>
        <td className="px-3 py-2 text-center">
          {staff.is_active ? t("activeYes") : t("activeNo")}
        </td>
        <td />
      </tr>
    );
  }

  return (
    <tr className={cn("border-t border-border align-top", !active && "opacity-60")}>
      <td className="px-3 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={cn(inputCls, "min-w-[130px] py-1.5")}
        />
        {err && (
          <span className="mt-1 block text-xs text-danger">
            {err === "email_exists"
              ? t("emailExists")
              : err === "forbidden"
                ? t("forbidden")
                : t("genericError")}
          </span>
        )}
      </td>
      <td className="hidden px-3 py-2 sm:table-cell">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="email@20fit.id"
          className={cn(inputCls, "min-w-[160px] py-1.5")}
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}
          className={cn(inputCls, "py-1.5")}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role_${r}`)}
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
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={save}
            disabled={!dirty || pending}
            className={cn(
              "inline-flex h-8 w-14 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
              dirty
                ? "bg-accent text-white hover:opacity-90"
                : "border border-border text-dim",
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
          <button
            onClick={remove}
            disabled={pending}
            aria-label={t("deleteStaff")}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function StaffManager({
  staff,
  canManage,
}: {
  staff: StaffMember[];
  canManage: boolean;
}) {
  const t = useTranslations("settings");
  const [list, setList] = useState(staff);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {t("staffCount", { count: list.length })}
        </span>
        {canManage && (
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {showAdd ? <X size={15} /> : <Plus size={15} />}
            {t("addStaff")}
          </button>
        )}
      </div>

      {!canManage && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-xs text-muted">
          <ShieldAlert size={15} className="mt-0.5 shrink-0 text-warning" />
          {t("staffReadOnly")}
        </div>
      )}

      {canManage && showAdd && (
        <AddStaffForm
          onCreated={(row) => {
            setList((prev) => [...prev, row]);
            setShowAdd(false);
          }}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{t("fullName")}</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">
                {t("emailLabel")}
              </th>
              <th className="px-3 py-2 font-medium">{t("role")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("active")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <StaffRow
                key={s.staff_id}
                staff={s}
                canManage={canManage}
                onRemoved={(id) =>
                  setList((prev) => prev.filter((x) => x.staff_id !== id))
                }
              />
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="py-8 text-center text-sm text-muted">{t("noStaff")}</div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
        {ROLES.map((r) => (
          <span key={r}>
            <span className="font-medium text-muted">{t(`role_${r}`)}</span> —{" "}
            {t(`roleDesc_${r}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function AddStaffForm({ onCreated }: { onCreated: (row: StaffMember) => void }) {
  const t = useTranslations("settings");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      full_name: String(fd.get("full_name") ?? ""),
      email: String(fd.get("email") ?? ""),
      role: String(fd.get("role") ?? "staff") as StaffRole,
      is_active: true,
    };
    const form = e.currentTarget;
    start(async () => {
      const res = await upsertStaff(input);
      if (!res.ok) {
        setError(
          res.error === "email_exists"
            ? t("emailExists")
            : res.error === "forbidden"
              ? t("forbidden")
              : res.error === "invalid_input"
                ? t("invalidStaff")
                : t("genericError"),
        );
        return;
      }
      onCreated({
        staff_id: res.id ?? crypto.randomUUID(),
        full_name: input.full_name.trim(),
        email: input.email.trim() || null,
        phone: null,
        role: input.role,
        is_active: true,
      });
      form.reset();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("fullName")}>
          <input name="full_name" required maxLength={200} className={inputCls} />
        </Field>
        <Field label={t("emailLabel")}>
          <input
            name="email"
            type="email"
            placeholder="email@20fit.id"
            maxLength={200}
            className={inputCls}
          />
        </Field>
        <Field label={t("role")}>
          <select name="role" defaultValue="staff" className={inputCls}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role_${r}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        {t("addStaff")}
      </button>
    </form>
  );
}
