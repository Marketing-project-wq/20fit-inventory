"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/import-server";
import { requireAdmin, requireActiveStaff } from "@/lib/auth";
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
