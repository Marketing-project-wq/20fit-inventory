"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
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

/**
 * Reads the shared "Nama Sales / Visitor" picker: a real sales_staff_id, or the
 * "other" sentinel meaning a daily worker whose name is typed into dw_name.
 */
function parseSalesSelection(formData: FormData): {
  sales_staff_id: string | null;
  dw_name: string | null;
} {
  const raw = String(formData.get("sales_staff_id") ?? "").trim();
  const dw = String(formData.get("dw_name") ?? "").trim();
  if (raw === "other") return { sales_staff_id: null, dw_name: dw || null };
  if (/^[0-9a-fA-F-]{36}$/.test(raw)) return { sales_staff_id: raw, dw_name: null };
  return { sales_staff_id: null, dw_name: null };
}

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

  const { sales_staff_id, dw_name } = parseSalesSelection(formData);

  // Optional proof photo → private "transfer-photos" bucket. Store the path;
  // the list view signs it on demand.
  let photoPath: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > 5_000_000) return { ok: false, error: "photo_too_large" };
    const ext =
      (photo.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") ||
      "jpg";
    const path = `transfers/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await sb!.storage
      .from("transfer-photos")
      .upload(path, photo, { contentType: photo.type || undefined, upsert: false });
    if (upErr) return { ok: false, error: "photo_upload_failed" };
    photoPath = path;
  }

  const { error } = await sb!.rpc("shop_record_transfer", {
    p_variant: d.variant_id,
    p_from: d.from_location_id,
    p_to: d.to_location_id,
    p_qty: d.quantity,
    p_notes: d.notes ?? null,
    p_sales_staff_id: sales_staff_id,
    p_dw_name: dw_name,
    p_photo_url: photoPath,
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

// ------------------------- Warehouse access log ----------------------------
const checkInSchema = z.object({
  location_id: z.string().uuid(),
  purpose: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function checkInAccess(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { sb, user, error: authErr } = await getAuthedClient();
  if (authErr) return { ok: false, error: authErr };
  const parsed = checkInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  // Visitor is either a sales staff (dropdown) or a daily worker ("Other").
  const { sales_staff_id, dw_name } = parseSalesSelection(formData);
  if (!sales_staff_id && !dw_name) return { ok: false, error: "invalid_input" };

  const { error } = await sb!.from("shop_warehouse_access_log").insert({
    location_id: d.location_id,
    sales_staff_id,
    dw_name,
    visitor_name: dw_name, // fallback for DW; sales name resolves via join
    purpose: d.purpose || null,
    notes: d.notes || null,
    user_id: user!.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "checked_in" };
}

export async function checkOutAccess(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "id");
  const log_id = String(formData.get("log_id") ?? "");
  const { sb, error } = await getAuthedClient();
  if (!error && log_id) {
    await sb!
      .from("shop_warehouse_access_log")
      .update({ check_out_at: new Date().toISOString() })
      .eq("log_id", log_id)
      .is("check_out_at", null);
    revalidatePath("/", "layout");
  }
  redirect(`/${locale}/akses-gudang`);
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

/** Build the app's public origin from the incoming request (works behind the
 *  Railway proxy), falling back to NEXT_PUBLIC_APP_URL. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

const emailSchema = z.string().trim().email();

/**
 * Send a password-reset email. The link returns the user to /auth/callback,
 * which exchanges the code for a session and forwards to /reset-sandi.
 * Always reports success so we don't leak which emails are registered.
 */
export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = String(formData.get("locale") ?? "id");
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, error: "email_invalid" };

  const sb = await createSupabaseServerClient();
  if (!sb) return { ok: false, error: "not_configured" };

  const origin = await requestOrigin();
  const next = encodeURIComponent(`/${locale}/reset-sandi`);
  await sb.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/${locale}/auth/callback?next=${next}`,
  });
  // Do not reveal whether the address exists.
  return { ok: true, message: "reset_sent" };
}

/**
 * Set a new password using the recovery session established by the reset link.
 * Signs the user out afterwards so they log in fresh with the new password.
 */
export async function updatePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { ok: false, error: "password_short" };
  if (password !== confirm) return { ok: false, error: "password_mismatch" };

  const sb = await createSupabaseServerClient();
  if (!sb) return { ok: false, error: "not_configured" };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "session_missing" };

  const { error } = await sb.auth.updateUser({ password });
  if (error) return { ok: false, error: "update_failed" };
  await sb.auth.signOut();
  return { ok: true, message: "password_updated" };
}
