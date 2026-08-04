"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Check, Loader2, Plus, UserX, X } from "lucide-react";
import { upsertStaff, createUserAccount } from "@/lib/settings-actions";
import type { StaffMember, StaffRole } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Field, Alert, inputCls } from "@/components/forms/ui";

const BASE_ROLES: StaffRole[] = ["admin", "manager", "staff", "viewer"];

/** Roles the current user may assign. super_admin only for super_admins; pending
 *  is only offered when the row is already pending (so its select has a match). */
function roleOptions(
  currentUserRole: StaffRole | null,
  rowRole: StaffRole,
): StaffRole[] {
  const opts: StaffRole[] = [];
  if (currentUserRole === "super_admin") opts.push("super_admin");
  opts.push(...BASE_ROLES);
  if (rowRole === "pending") opts.push("pending");
  return opts;
}

function fmtWhen(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd MMM yyyy, HH:mm");
}

function StaffRow({
  staff,
  currentUserRole,
}: {
  staff: StaffMember;
  currentUserRole: StaffRole | null;
}) {
  const t = useTranslations("settings");
  const [name, setName] = useState(staff.full_name);
  const [nickname, setNickname] = useState(staff.nickname ?? "");
  const [email, setEmail] = useState(staff.email ?? "");
  const [role, setRole] = useState<StaffRole>(staff.role);
  const [active, setActive] = useState(staff.is_active);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty =
    name !== staff.full_name ||
    nickname !== (staff.nickname ?? "") ||
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
        nickname,
        email,
        role,
        is_active: active,
      });
      if (!res.ok) {
        setErr(res.error ?? "generic");
        return;
      }
      staff.full_name = name;
      staff.nickname = nickname || null;
      staff.email = email || null;
      staff.role = role;
      staff.is_active = active;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  // "Remove" deactivates (is_active = false) rather than hard-deleting, so the
  // audit trail and any linked login account are preserved. Reactivate via the
  // Active checkbox + Save.
  function deactivate() {
    if (!active) return;
    if (!confirm(t("confirmDeactivateStaff"))) return;
    setErr(null);
    start(async () => {
      const res = await upsertStaff({
        staff_id: staff.staff_id,
        full_name: staff.full_name,
        nickname: staff.nickname,
        email: staff.email ?? undefined,
        role: staff.role,
        is_active: false,
      });
      if (res.ok) {
        staff.is_active = false;
        setActive(false);
      } else setErr(res.error ?? "generic");
    });
  }

  return (
    <tr className={cn("border-t border-border align-top", !active && "opacity-60")}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(inputCls, "min-w-[130px] py-1.5")}
          />
          {staff.role === "pending" && (
            <span className="shrink-0 whitespace-nowrap rounded-full border border-warning px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
              {t("role_pending")}
            </span>
          )}
        </div>
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
      <td className="hidden px-3 py-2 md:table-cell">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={60}
          placeholder="—"
          className={cn(inputCls, "min-w-[110px] py-1.5")}
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}
          className={cn(inputCls, "py-1.5")}
        >
          {roleOptions(currentUserRole, staff.role).map((r) => (
            <option key={r} value={r}>
              {t(`role_${r}`)}
            </option>
          ))}
        </select>
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-muted lg:table-cell">
        {fmtWhen(staff.last_login_at)}
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-muted lg:table-cell">
        {fmtWhen(staff.last_activity_at)}
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
            onClick={deactivate}
            disabled={pending || !active}
            aria-label={t("deactivateStaff")}
            title={t("deactivateStaff")}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted"
          >
            <UserX size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function UserManagement({
  staff,
  currentUserRole,
}: {
  staff: StaffMember[];
  currentUserRole: StaffRole | null;
}) {
  const t = useTranslations("settings");
  const [list, setList] = useState(staff);
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const pendingCount = list.filter((s) => s.role === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>{t("staffCount", { count: list.length })}</span>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning px-2 py-0.5 font-medium text-warning">
              {t("pendingCount", { count: pendingCount })}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {showAdd ? <X size={15} /> : <Plus size={15} />}
          {t("addStaff")}
        </button>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      {showAdd && (
        <AddUserForm
          currentUserRole={currentUserRole}
          onCreated={(row, linked) => {
            setList((prev) => [...prev, row]);
            setShowAdd(false);
            setNotice(linked ? t("userLinked") : t("userCreated"));
          }}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{t("fullName")}</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">
                {t("emailLabel")}
              </th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">
                {t("nickname")}
              </th>
              <th className="px-3 py-2 font-medium">{t("role")}</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">
                {t("lastLogin")}
              </th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">
                {t("lastActivity")}
              </th>
              <th className="px-3 py-2 text-center font-medium">{t("active")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <StaffRow
                key={s.staff_id}
                staff={s}
                currentUserRole={currentUserRole}
              />
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="py-8 text-center text-sm text-muted">{t("noStaff")}</div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
        {roleOptions(currentUserRole, "viewer").map((r) => (
          <span key={r}>
            <span className="font-medium text-muted">{t(`role_${r}`)}</span> —{" "}
            {t(`roleDesc_${r}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function AddUserForm({
  currentUserRole,
  onCreated,
}: {
  currentUserRole: StaffRole | null;
  onCreated: (row: StaffMember, linked: boolean) => void;
}) {
  const t = useTranslations("settings");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const addableRoles = roleOptions(currentUserRole, "viewer");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      full_name: String(fd.get("full_name") ?? ""),
      nickname: String(fd.get("nickname") ?? ""),
      email: String(fd.get("email") ?? ""),
      role: String(fd.get("role") ?? "staff") as StaffRole,
      password: String(fd.get("password") ?? ""),
    };
    const form = e.currentTarget;
    start(async () => {
      const res = await createUserAccount(input);
      if (!res.ok) {
        setError(
          res.error === "user_exists"
            ? t("userExists")
            : res.error === "email_invalid" || res.error === "invalid_input"
              ? t("emailInvalid")
              : res.error === "password_short"
                ? t("passwordShort")
                : res.error === "forbidden"
                  ? t("forbidden")
                  : t("genericError"),
        );
        return;
      }
      onCreated(
        {
          staff_id: res.id ?? crypto.randomUUID(),
          full_name: input.full_name.trim(),
          nickname: input.nickname.trim() || null,
          email: input.email.trim().toLowerCase() || null,
          phone: null,
          role: input.role,
          is_active: true,
          last_activity_at: null,
          last_login_at: null,
        },
        res.linked ?? false,
      );
      form.reset();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t("fullName")}>
          <input name="full_name" required maxLength={200} className={inputCls} />
        </Field>
        <Field label={t("emailLabel")}>
          <input
            name="email"
            type="email"
            required
            placeholder="email@20fit.id"
            maxLength={200}
            className={inputCls}
          />
        </Field>
        <Field label={t("nickname")}>
          <input name="nickname" maxLength={60} className={inputCls} />
        </Field>
        <Field label={t("role")}>
          <select name="role" defaultValue="staff" className={inputCls}>
            {addableRoles.map((r) => (
              <option key={r} value={r}>
                {t(`role_${r}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("tempPassword")} hint={t("tempPasswordHint")}>
          <input
            name="password"
            type="text"
            required
            minLength={8}
            maxLength={200}
            autoComplete="off"
            className={inputCls}
          />
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
