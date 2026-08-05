"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/import-server";
import { requireAdmin, requireActiveStaff } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { roleAtLeast, type StaffRole } from "@/lib/roles";

export type SettingsResult = { ok: boolean; error?: string; id?: string };

export type SkuFormOptions = {
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
};

/** Category + brand options for the inline Create-SKU drawer (import screens).
 *  Lazy-loaded on demand so import panels don't need them threaded as props. */
export async function loadSkuFormOptions(): Promise<SkuFormOptions> {
  const { sb, error } = await requireUser();
  if (error || !sb) return { categories: [], brands: [] };
  const [cats, brands] = await Promise.all([
    sb.from("shop_categories").select("category_id,name").order("name"),
    sb.from("shop_brands").select("brand_id,name").order("name"),
  ]);
  return {
    categories: (cats.data ?? []).map((c) => ({ id: c.category_id, name: c.name })),
    brands: (brands.data ?? []).map((b) => ({ id: b.brand_id, name: b.name })),
  };
}
export type SettingsState = {
  ok: boolean;
  error?: string;
  message?: string;
} | null;

const optNum = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().nonnegative().nullable(),
);
const optInt = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().int().nonnegative().nullable(),
);

// ------------------------------- Variants ----------------------------------
const variantSchema = z.object({
  variant_id: z.string().uuid(),
  cost_price: optNum,
  selling_price: optNum,
  reorder_point: optInt,
  is_active: z.boolean(),
});

export async function updateVariant(input: unknown): Promise<SettingsResult> {
  const { sb, error } = await requireAdmin();
  if (error) return { ok: false, error };
  const p = variantSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_input" };
  const d = p.data;

  const { error: e } = await sb!
    .from("shop_product_variants")
    .update({
      cost_price: d.cost_price,
      selling_price: d.selling_price,
      reorder_point: d.reorder_point,
      is_active: d.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("variant_id", d.variant_id);
  if (e) return { ok: false, error: e.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ------------------------------- Create SKU ---------------------------------
const createSkuSchema = z.object({
  name: z.string().trim().min(1).max(300),
  name_en: z.string().trim().max(300).optional(),
  sku_code: z.string().trim().min(1).max(100),
  category_id: z.string().uuid().nullable().optional(),
  brand_id: z.string().uuid().nullable().optional(),
  cost_price: optNum,
  selling_price: optNum,
  reorder_point: optInt,
  unit_of_measure: z.string().trim().max(20).optional(),
});

export async function createSku(input: unknown): Promise<SettingsResult> {
  const { sb, error } = await requireAdmin();
  if (error) return { ok: false, error };
  const p = createSkuSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_input" };
  const d = p.data;

  const { data, error: e } = await sb!.rpc("shop_create_sku", {
    p_name: d.name,
    p_name_en: d.name_en || null,
    p_sku_code: d.sku_code,
    p_category: d.category_id || null,
    p_brand: d.brand_id || null,
    p_cost: d.cost_price,
    p_selling: d.selling_price,
    p_reorder: d.reorder_point,
    p_unit: d.unit_of_measure || null,
  });
  if (e) {
    if (e.message.includes("sku_exists")) return { ok: false, error: "sku_exists" };
    return { ok: false, error: e.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, id: typeof data === "string" ? data : undefined };
}

// ------------------------------- Locations ----------------------------------
const locationSchema = z.object({
  location_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  type: z.enum(["warehouse", "showroom", "storage", "in-transit"]),
  is_active: z.boolean(),
});

export async function upsertLocation(input: unknown): Promise<SettingsResult> {
  const { sb, error } = await requireAdmin();
  if (error) return { ok: false, error };
  const p = locationSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_input" };
  const d = p.data;

  if (d.location_id) {
    const { error: e } = await sb!
      .from("shop_locations")
      .update({ name: d.name, type: d.type, is_active: d.is_active })
      .eq("location_id", d.location_id);
    if (e) return { ok: false, error: e.message };
    revalidatePath("/", "layout");
    return { ok: true, id: d.location_id };
  }

  const { data, error: e } = await sb!
    .from("shop_locations")
    .insert({ name: d.name, type: d.type, is_active: d.is_active })
    .select("location_id")
    .single();
  if (e) return { ok: false, error: e.message };
  revalidatePath("/", "layout");
  return { ok: true, id: data?.location_id };
}

// -------------------------------- Staff -------------------------------------
/** The current user's role from their ACTIVE shop_staff row (null if none).
 *  Matches by user_id (backfilled), falling back to email. No bootstrap bypass. */
async function currentRole(sb: SupabaseClient): Promise<StaffRole | null> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  let row = (
    await sb
      .from("shop_staff")
      .select("role,is_active")
      .eq("user_id", user.id)
      .maybeSingle()
  ).data;
  if (!row && user.email) {
    row = (
      await sb
        .from("shop_staff")
        .select("role,is_active")
        .eq("email", user.email)
        .maybeSingle()
    ).data;
  }
  if (!row || !row.is_active) return null;
  return row.role as StaffRole;
}

const staffSchema = z.object({
  staff_id: z.string().uuid().nullable().optional(),
  full_name: z.string().trim().min(1).max(200),
  nickname: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(60).nullable().optional(),
  ),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().email().max(200).optional(),
  ),
  phone: z.string().trim().max(50).optional(),
  role: z.enum(["super_admin", "admin", "manager", "staff", "viewer", "pending"]),
  is_active: z.boolean(),
});

export async function upsertStaff(input: unknown): Promise<SettingsResult> {
  const { sb, error } = await requireUser();
  if (error) return { ok: false, error };
  const actor = await currentRole(sb!);
  if (!roleAtLeast(actor, "admin")) return { ok: false, error: "forbidden" };
  const p = staffSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_input" };
  const d = p.data;

  // Only a super_admin may grant super_admin, or edit an existing super_admin row.
  if (d.role === "super_admin" && actor !== "super_admin")
    return { ok: false, error: "forbidden" };
  if (d.staff_id) {
    const { data: target } = await sb!
      .from("shop_staff")
      .select("role")
      .eq("staff_id", d.staff_id)
      .maybeSingle();
    if (target?.role === "super_admin" && actor !== "super_admin")
      return { ok: false, error: "forbidden" };
  }

  const row = {
    full_name: d.full_name,
    nickname: d.nickname ?? null,
    email: d.email ?? null,
    phone: d.phone || null,
    role: d.role,
    is_active: d.is_active,
    updated_at: new Date().toISOString(),
  };
  const dupe = (msg: string) =>
    /duplicate|unique/i.test(msg) ? "email_exists" : msg;

  if (d.staff_id) {
    const { error: e } = await sb!
      .from("shop_staff")
      .update(row)
      .eq("staff_id", d.staff_id);
    if (e) return { ok: false, error: dupe(e.message) };
    revalidatePath("/", "layout");
    return { ok: true, id: d.staff_id };
  }
  const { data, error: e } = await sb!
    .from("shop_staff")
    .insert(row)
    .select("staff_id")
    .single();
  if (e) return { ok: false, error: dupe(e.message) };
  revalidatePath("/", "layout");
  return { ok: true, id: data?.staff_id };
}

export async function deleteStaff(input: unknown): Promise<SettingsResult> {
  const { sb, error } = await requireUser();
  if (error) return { ok: false, error };
  const actor = await currentRole(sb!);
  if (!roleAtLeast(actor, "admin")) return { ok: false, error: "forbidden" };
  const parsed = z
    .object({ staff_id: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  // Only a super_admin may delete a super_admin row.
  const { data: target } = await sb!
    .from("shop_staff")
    .select("role")
    .eq("staff_id", parsed.data.staff_id)
    .maybeSingle();
  if (target?.role === "super_admin" && actor !== "super_admin")
    return { ok: false, error: "forbidden" };
  const { error: e } = await sb!
    .from("shop_staff")
    .delete()
    .eq("staff_id", parsed.data.staff_id);
  if (e) return { ok: false, error: e.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// -------------------------- Create user account -----------------------------
export type CreateUserResult = {
  ok: boolean;
  error?: string;
  id?: string;
  /** True when an existing ecosystem auth account was linked (not newly created). */
  linked?: boolean;
};

const createUserSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  nickname: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(60).nullable().optional(),
  ),
  email: z.string().trim().email().max(200),
  role: z.enum(["super_admin", "admin", "manager", "staff", "viewer", "pending"]),
  password: z.string().min(8).max(200),
});

/** Escape LIKE/ILIKE wildcards so an email is matched literally (e.g. `_`). */
function likeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

/**
 * Admin-provision a login account. Two paths, distinguished server-side:
 *   * NEW email → create an auth.users account with the temporary password
 *     (email pre-confirmed, since the admin is vouching) and flag the staff row
 *     `must_change_password` so first login forces a real password.
 *   * Email already in the shared ecosystem pool but NOT a shop staff member →
 *     "claim": link a staff row to that account WITHOUT touching its credentials
 *     (the person keeps their shared-pool password; no forced change).
 *   * Email already a shop staff member → true duplicate, blocked.
 * super_admin may only be granted by a super_admin (parity with upsertStaff).
 */
export async function createUserAccount(input: unknown): Promise<CreateUserResult> {
  const { sb, error } = await requireUser();
  if (error) return { ok: false, error };
  const actor = await currentRole(sb!);
  if (!roleAtLeast(actor, "admin")) return { ok: false, error: "forbidden" };

  const p = createUserSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_input" };
  const d = p.data;
  if (d.role === "super_admin" && actor !== "super_admin")
    return { ok: false, error: "forbidden" };

  // Privileged operations (auth admin API + user_id-linked insert) need the
  // service-role client; the RLS-bound session client cannot create auth users.
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "not_configured" };

  const email = d.email.toLowerCase().trim();

  // Already a shop staff member with this email → true duplicate.
  const { data: existingStaff } = await admin
    .from("shop_staff")
    .select("staff_id")
    .ilike("email", likeLiteral(email))
    .maybeSingle();
  if (existingStaff) return { ok: false, error: "user_exists" };

  // Does the email already exist in the shared ecosystem auth pool?
  const { data: existingId, error: lookupErr } = await admin.rpc(
    "shop_find_auth_user",
    { p_email: email },
  );
  if (lookupErr) return { ok: false, error: lookupErr.message };

  let userId: string;
  let mustChange: boolean;
  let linked: boolean;

  if (existingId) {
    userId = existingId as string;
    mustChange = false;
    linked = true;
  } else {
    const created = await admin.auth.admin.createUser({
      email,
      password: d.password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      const msg = created.error?.message ?? "";
      if (/regist|exist/i.test(msg)) return { ok: false, error: "user_exists" };
      if (/password/i.test(msg)) return { ok: false, error: "password_short" };
      if (/email/i.test(msg)) return { ok: false, error: "email_invalid" };
      return { ok: false, error: msg || "create_failed" };
    }
    userId = created.data.user.id;
    mustChange = true;
    linked = false;
  }

  const dupe = (m: string) => (/duplicate|unique/i.test(m) ? "user_exists" : m);
  const { data: row, error: insErr } = await admin
    .from("shop_staff")
    .insert({
      full_name: d.full_name,
      nickname: d.nickname ?? null,
      email,
      role: d.role,
      user_id: userId,
      is_active: true,
      must_change_password: mustChange,
      email_verified: true, // admin vouches — no self-verification needed
    })
    .select("staff_id")
    .single();
  if (insErr) return { ok: false, error: dupe(insErr.message) };

  revalidatePath("/", "layout");
  return { ok: true, id: row?.staff_id, linked };
}

// ---------------------------- Own profile -----------------------------------
const nicknameSchema = z.object({
  nickname: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(60).nullable(),
  ),
});

/** Self-service: any active staff (viewer+) may set their own display nickname. */
export async function updateOwnProfile(input: unknown): Promise<SettingsResult> {
  const { sb, error } = await requireActiveStaff();
  if (error) return { ok: false, error };
  const p = nicknameSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_input" };

  const {
    data: { user },
  } = await sb!.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const patch = { nickname: p.data.nickname, updated_at: new Date().toISOString() };
  // Update the caller's own row, matched by user_id (backfilled) then email.
  let res = await sb!
    .from("shop_staff")
    .update(patch)
    .eq("user_id", user.id)
    .select("staff_id");
  if ((!res.data || res.data.length === 0) && user.email) {
    res = await sb!
      .from("shop_staff")
      .update(patch)
      .eq("email", user.email)
      .select("staff_id");
  }
  if (res.error) return { ok: false, error: res.error.message };
  if (!res.data || res.data.length === 0) return { ok: false, error: "forbidden" };
  revalidatePath("/", "layout");
  return { ok: true, id: res.data[0].staff_id };
}

// ------------------------------- Password -----------------------------------
export async function changePassword(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  // Self-service: any active staff (viewer+) may change their own password.
  const { sb, error } = await requireActiveStaff();
  if (error) return { ok: false, error };
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { ok: false, error: "password_short" };
  if (password !== confirm) return { ok: false, error: "password_mismatch" };

  const { error: e } = await sb!.auth.updateUser({ password });
  if (e) return { ok: false, error: "update_failed" };

  // Clear the forced-change flag on the caller's own staff row (matched by
  // user_id, then email) so the middleware stops parking them on /ganti-sandi.
  const {
    data: { user },
  } = await sb!.auth.getUser();
  if (user) {
    const clear = { must_change_password: false, updated_at: new Date().toISOString() };
    const byId = await sb!
      .from("shop_staff")
      .update(clear)
      .eq("user_id", user.id)
      .select("staff_id");
    if ((!byId.data || byId.data.length === 0) && user.email) {
      await sb!.from("shop_staff").update(clear).eq("email", user.email);
    }
  }
  return { ok: true, message: "password_changed" };
}

// ----------------------------- Sales staff ----------------------------------
// Names for the Transfer / Warehouse Access dropdowns. Separate from shop_staff
// (which are login accounts) — these are just picklist entries.
const nameOnly = (msg: string) =>
  /duplicate|unique/i.test(msg) ? "name_exists" : msg;

export async function createSalesStaff(input: unknown): Promise<SettingsResult> {
  const { sb, error } = await requireUser();
  if (error) return { ok: false, error };
  const p = z.object({ name: z.string().trim().min(1).max(120) }).safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_input" };

  const { data: last } = await sb!
    .from("shop_sales_staff")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? 0) + 1;

  const { data, error: e } = await sb!
    .from("shop_sales_staff")
    .insert({ name: p.data.name, sort_order })
    .select("staff_id")
    .single();
  if (e) return { ok: false, error: nameOnly(e.message) };
  revalidatePath("/", "layout");
  return { ok: true, id: data?.staff_id };
}

export async function renameSalesStaff(input: unknown): Promise<SettingsResult> {
  const { sb, error } = await requireUser();
  if (error) return { ok: false, error };
  const p = z
    .object({ staff_id: z.string().uuid(), name: z.string().trim().min(1).max(120) })
    .safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_input" };
  const { error: e } = await sb!
    .from("shop_sales_staff")
    .update({ name: p.data.name, updated_at: new Date().toISOString() })
    .eq("staff_id", p.data.staff_id);
  if (e) return { ok: false, error: nameOnly(e.message) };
  revalidatePath("/", "layout");
  return { ok: true, id: p.data.staff_id };
}

export async function toggleSalesStaff(input: unknown): Promise<SettingsResult> {
  const { sb, error } = await requireUser();
  if (error) return { ok: false, error };
  const p = z
    .object({ staff_id: z.string().uuid(), is_active: z.boolean() })
    .safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_input" };
  const { error: e } = await sb!
    .from("shop_sales_staff")
    .update({ is_active: p.data.is_active, updated_at: new Date().toISOString() })
    .eq("staff_id", p.data.staff_id);
  if (e) return { ok: false, error: e.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteSalesStaff(input: unknown): Promise<SettingsResult> {
  const { sb, error } = await requireUser();
  if (error) return { ok: false, error };
  const p = z.object({ staff_id: z.string().uuid() }).safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_input" };
  const { error: e } = await sb!
    .from("shop_sales_staff")
    .delete()
    .eq("staff_id", p.data.staff_id);
  // FK from movements / access log → can't hard-delete once used.
  if (e) return { ok: false, error: /foreign key|23503/i.test(e.message) ? "in_use" : e.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
