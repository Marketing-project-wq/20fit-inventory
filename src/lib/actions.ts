"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionState = {
  ok: boolean;
  error?: string;
  message?: string;
} | null;

/**
 * The stock RPCs are SECURITY DEFINER and granted to `authenticated`, so we call
 * them as the logged-in user — no service-role key required.
 */
async function getAuthedClient() {
  const sb = await createSupabaseServerClient();
  if (!sb) return { sb: null, user: null, error: "not_configured" as const };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { sb: null, user: null, error: "unauthorized" as const };
  return { sb, user, error: null as null };
}

const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().nonnegative().optional(),
);

// ------------------------------- Goods in ----------------------------------
const stockInSchema = z.object({
  variant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  unit_cost: optionalNumber,
  notes: z.string().trim().max(500).optional(),
});

export async function recordStockIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { sb, error: authErr } = await getAuthedClient();
  if (authErr) return { ok: false, error: authErr };
  const parsed = stockInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const { error } = await sb!.rpc("shop_record_movement", {
    p_variant: d.variant_id,
    p_location: d.location_id,
    p_type: "purchase_receipt",
    p_qty: d.quantity,
    p_unit_cost: d.unit_cost ?? null,
    p_reference_type: "manual",
    p_notes: d.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "saved" };
}

// ------------------------------- Goods out ---------------------------------
const stockOutSchema = z.object({
  variant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  sales_channel: z.enum(["offline", "tokopedia", "shopee", "b2b_direct", "other"]),
  marketplace_order_number: z.string().trim().max(120).optional(),
  customer: z.string().trim().max(200).optional(),
  allow_backorder: z.preprocess(
    (v) => v === "on" || v === "true" || v === true,
    z.boolean().optional(),
  ),
});

export async function recordStockOut(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { sb, error: authErr } = await getAuthedClient();
  if (authErr) return { ok: false, error: authErr };
  const parsed = stockOutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const { error } = await sb!.rpc("shop_record_movement", {
    p_variant: d.variant_id,
    p_location: d.location_id,
    p_type: "sale",
    p_qty: d.quantity,
    p_reference_type: "manual",
    p_sales_channel: d.sales_channel,
    p_marketplace_order: d.marketplace_order_number || null,
    p_notes: d.customer || null,
    p_allow_backorder: d.allow_backorder ?? false,
  });
  if (error) {
    if (error.message.includes("insufficient_stock"))
      return { ok: false, error: "insufficient_stock" };
    return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "saved" };
}

// ------------------------------- Transfer ----------------------------------
const transferSchema = z.object({
  variant_id: z.string().uuid(),
  from_location_id: z.string().uuid(),
  to_location_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  notes: z.string().trim().max(500).optional(),
});

export async function recordTransfer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { sb, error: authErr } = await getAuthedClient();
  if (authErr) return { ok: false, error: authErr };
  const parsed = transferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  if (d.from_location_id === d.to_location_id)
    return { ok: false, error: "same_location" };

  const { error } = await sb!.rpc("shop_record_transfer", {
    p_variant: d.variant_id,
    p_from: d.from_location_id,
    p_to: d.to_location_id,
    p_qty: d.quantity,
    p_notes: d.notes ?? null,
  });
  if (error) {
    if (error.message.includes("insufficient_stock"))
      return { ok: false, error: "insufficient_stock" };
    if (error.message.includes("same_location"))
      return { ok: false, error: "same_location" };
    return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "saved" };
}

// ----------------------------- Stock opname --------------------------------
export async function createOpname(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "id");
  const location_id = String(formData.get("location_id") ?? "");
  const { sb, user, error } = await getAuthedClient();
  if (error || !location_id) redirect(`/${locale}/stock-opname`);
  const { data, error: rpcError } = await sb!.rpc("shop_create_opname", {
    p_location: location_id,
    p_user: user!.id,
  });
  if (rpcError || !data) redirect(`/${locale}/stock-opname`);
  redirect(`/${locale}/stock-opname/${data}`);
}

export async function saveOpnameCounts(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { sb, error: authErr } = await getAuthedClient();
  if (authErr) return { ok: false, error: authErr };
  const session_id = String(formData.get("session_id") ?? "");
  if (!session_id) return { ok: false, error: "invalid_input" };

  const counts: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("count_")) counts[k.slice(6)] = String(v);
  }
  const { error } = await sb!.rpc("shop_save_opname_counts", {
    p_session: session_id,
    p_counts: counts,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "saved" };
}

export async function approveOpname(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "id");
  const session_id = String(formData.get("session_id") ?? "");
  const { sb, user, error } = await getAuthedClient();
  if (error || !session_id) redirect(`/${locale}/stock-opname`);
  await sb!.rpc("shop_apply_opname", { p_session: session_id, p_user: user!.id });
  redirect(`/${locale}/stock-opname/${session_id}`);
}

// --------------------------------- Auth ------------------------------------
export async function signIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const locale = String(formData.get("locale") ?? "id");
  const rawNext = String(formData.get("next") ?? "");
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : `/${locale}`;

  if (!email || !password) return { ok: false, error: "invalid_input" };
  const sb = await createSupabaseServerClient();
  if (!sb) return { ok: false, error: "not_configured" };

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "invalid_credentials" };
  redirect(next);
}

export async function signOut(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "id");
  const sb = await createSupabaseServerClient();
  if (sb) await sb.auth.signOut();
  redirect(`/${locale}/login`);
}
