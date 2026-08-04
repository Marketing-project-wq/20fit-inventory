"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";

export type ActionState = {
  ok: boolean;
  error?: string;
  message?: string;
} | null;

/**
 * Authed client for stock/movement actions. Requires an ACTIVE shop_staff row
 * of at least `staff` — viewers, pending, and unregistered users are rejected
 * (`forbidden`). The stock RPCs are SECURITY DEFINER granted to `authenticated`,
 * so we run them as the logged-in user — no service-role key required.
 */
async function getAuthedClient() {
  const g = await requireRole("staff");
  if (g.error) return { sb: null, user: null, error: g.error };
  return { sb: g.sb, user: g.user, error: null as null };
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

// ------------------------- Return in / Damaged in --------------------------
// Uploads an optional condition photo to the private item-photos bucket.
async function uploadItemPhoto(
  sb: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  file: File,
  folder: string,
): Promise<{ path?: string; error?: string }> {
  if (file.size > 10_000_000) return { error: "photo_too_large" };
  const ext =
    (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await sb.storage
    .from("item-photos")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) return { error: "photo_upload_failed" };
  return { path };
}

const returnInSchema = z.object({
  variant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  reason_code: z.string().trim().min(1).max(60),
  reason_other: z.string().trim().max(200).optional(),
  item_condition: z.enum(["good", "damaged"]),
  notes: z.string().trim().max(500).optional(),
  reference_number: z.string().trim().max(120).optional(),
});

export async function recordReturnIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { sb, error: authErr } = await getAuthedClient();
  if (authErr) return { ok: false, error: authErr };
  const parsed = returnInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  const damaged = d.item_condition === "damaged";
  const reason = d.reason_code === "other" ? d.reason_other?.trim() || "other" : d.reason_code;

  let photoPath: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const up = await uploadItemPhoto(sb!, photo, "returns");
    if (up.error) return { ok: false, error: up.error };
    photoPath = up.path!;
  }
  // Damaged returns must document the condition.
  if (damaged && !photoPath) return { ok: false, error: "photo_required" };
  if (damaged && !d.notes?.trim()) return { ok: false, error: "notes_required" };

  const { error } = await sb!.rpc("shop_record_movement", {
    p_variant: d.variant_id,
    p_location: d.location_id,
    p_type: damaged ? "return_in_damaged" : "return_in",
    p_qty: d.quantity,
    p_reference_type: "manual",
    p_reason: reason,
    p_notes: d.notes ?? null,
    p_item_condition: d.item_condition,
    p_photo_url: photoPath,
    p_reference_number: d.reference_number ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "saved" };
}

const damageInSchema = z.object({
  variant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  reason_code: z.string().trim().min(1).max(60),
  reason_other: z.string().trim().max(200).optional(),
  notes: z.string().trim().min(1).max(500),
  unit_cost: optionalNumber,
  reference_number: z.string().trim().max(120).optional(),
});

export async function recordDamageIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { sb, error: authErr } = await getAuthedClient();
  if (authErr) return { ok: false, error: authErr };
  const parsed = damageInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  const reason = d.reason_code === "other" ? d.reason_other?.trim() || "other" : d.reason_code;

  let photoPath: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const up = await uploadItemPhoto(sb!, photo, "damage");
    if (up.error) return { ok: false, error: up.error };
    photoPath = up.path!;
  }
  if (!photoPath) return { ok: false, error: "photo_required" };

  const { error } = await sb!.rpc("shop_record_movement", {
    p_variant: d.variant_id,
    p_location: d.location_id,
    p_type: "damage_in",
    p_qty: d.quantity,
    p_unit_cost: d.unit_cost ?? null,
    p_reference_type: "manual",
    p_reason: reason,
    p_notes: d.notes,
    p_item_condition: "damaged",
    p_photo_url: photoPath,
    p_reference_number: d.reference_number ?? null,
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

// -------------------- Warranty / repair goods-out --------------------------
const warrantyOutSchema = z.object({
  variant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  reason_code: z.string().trim().min(1).max(60),
  reason_other: z.string().trim().max(200).optional(),
  supplier_name: z.string().trim().min(1).max(200),
  claim_number: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  unit_cost: optionalNumber,
});

export async function recordWarrantyOut(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { sb, error: authErr } = await getAuthedClient();
  if (authErr) return { ok: false, error: authErr };
  const parsed = warrantyOutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  const reason =
    d.reason_code === "other" ? d.reason_other?.trim() || "other" : d.reason_code;

  // Optional documentation photo of the item before shipping.
  let photoPath: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const up = await uploadItemPhoto(sb!, photo, "warranty");
    if (up.error) return { ok: false, error: up.error };
    photoPath = up.path!;
  }

  const { data, error } = await sb!.rpc("shop_record_warranty_out", {
    p_variant: d.variant_id,
    p_location: d.location_id,
    p_qty: d.quantity,
    p_reason: reason,
    p_notes: d.notes ?? null,
    p_supplier_name: d.supplier_name,
    p_claim_number: d.claim_number || null,
    p_photo_url: photoPath,
    p_unit_cost: d.unit_cost ?? null,
  });
  if (error) {
    if (error.message.includes("insufficient_damaged_stock"))
      return { ok: false, error: "insufficient_damaged_stock" };
    return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  const claimNumber =
    data && typeof data === "object" ? (data as { claim_number?: string }).claim_number : undefined;
  return { ok: true, message: claimNumber ?? "saved" };
}

// Disposal (damage_out, from damaged) & return-to-supplier (return_out, from good).
// Both route through the generic recorder; the `kind` field picks type + pool.
const conditionOutSchema = z.object({
  kind: z.enum(["disposal", "return_supplier"]),
  variant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  notes: z.string().trim().max(500).optional(),
  reference_number: z.string().trim().max(120).optional(),
});

export async function recordConditionOut(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { sb, error: authErr } = await getAuthedClient();
  if (authErr) return { ok: false, error: authErr };
  const parsed = conditionOutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  const disposal = d.kind === "disposal";

  const { error } = await sb!.rpc("shop_record_movement", {
    p_variant: d.variant_id,
    p_location: d.location_id,
    p_type: disposal ? "damage_out" : "return_out",
    p_qty: d.quantity,
    p_reference_type: "manual",
    p_notes: d.notes ?? null,
    p_item_condition: disposal ? "damaged" : "good",
    p_reference_number: d.reference_number ?? null,
  });
  if (error) {
    if (error.message.includes("insufficient_stock"))
      return { ok: false, error: "insufficient_stock" };
    return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "saved" };
}

const claimStatusSchema = z.object({
  claim_id: z.string().uuid(),
  status: z.enum(["sent", "in_repair", "resolved", "rejected", "closed"]),
  resolution_notes: z.string().trim().max(500).optional(),
});

export async function updateWarrantyClaimStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { sb, error: authErr } = await getAuthedClient();
  if (authErr) return { ok: false, error: authErr };
  const parsed = claimStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  const closed = ["resolved", "rejected", "closed"].includes(d.status);

  const { error } = await sb!
    .from("shop_warranty_claims")
    .update({
      status: d.status,
      resolution_notes: d.resolution_notes || null,
      resolved_at: closed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("claim_id", d.claim_id);
  if (error) return { ok: false, error: error.message };
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
 * Reads the "Nama Sales / Penanggung Jawab" field. The sales-staff picklist has
 * been retired: new records store the responsible person's name directly in
 * `dw_name` (pre-filled from the logged-in user, editable — e.g. a daily
 * worker). A legacy `sales_staff_id` UUID is still honored if one is posted, so
 * historical references keep resolving.
 */
function parseSalesSelection(formData: FormData): {
  sales_staff_id: string | null;
  dw_name: string | null;
} {
  const raw = String(formData.get("sales_staff_id") ?? "").trim();
  const dw = String(formData.get("dw_name") ?? "").trim();
  if (/^[0-9a-fA-F-]{36}$/.test(raw)) return { sales_staff_id: raw, dw_name: null };
  return { sales_staff_id: null, dw_name: dw || null };
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

const signUpSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  nickname: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(60).nullable().optional(),
  ),
});

const STAFF_DOMAIN = "@20fit.id";

/**
 * Public self-service sign-up. Creates the auth account via the anon client
 * (`signUp`, NOT the admin API) so email verification is sent, then provisions a
 * matching shop_staff row via the service-role client (there is no session yet
 * when confirmation is required, so RLS-bound inserts would fail):
 *   - `@20fit.id` email → role `staff`, active (straight into the app once
 *     verified);
 *   - any other email  → role `pending`, active but authorized for nothing until
 *     an admin promotes them (they land on /pending after verifying).
 * If the staff-row insert fails after the auth account exists, we still report
 * success: the user can verify + log in and will sit on /pending (no shop_staff
 * row = no access, per Phase 0), where an admin can create their row manually.
 */
export async function signUp(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    nickname: formData.get("nickname"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  const email = d.email.toLowerCase();

  const sb = await createSupabaseServerClient();
  if (!sb) return { ok: false, error: "not_configured" };

  const origin = await requestOrigin();
  const locale = String(formData.get("locale") ?? "id");
  // Send the verification link through the shared auth callback, forwarding to
  // the app root afterward (the callback defaults `next` to the reset page, so
  // pass it explicitly). Middleware then routes staff → app, pending → /pending.
  const next = encodeURIComponent(`/${locale}`);
  const { data, error } = await sb.auth.signUp({
    email,
    password: d.password,
    options: { emailRedirectTo: `${origin}/${locale}/auth/callback?next=${next}` },
  });
  if (error) {
    if (/password/i.test(error.message))
      return { ok: false, error: "password_short" };
    return { ok: false, error: "signup_failed" };
  }

  // Existing address → Supabase returns an obfuscated user with no identities
  // (anti-enumeration) and sends no email. Don't provision a staff row; show the
  // same verify message so we never reveal whether an email is registered.
  const user = data.user;
  const isNewUser = Boolean(user && (user.identities?.length ?? 0) > 0);
  if (user && isNewUser) {
    const role = email.endsWith(STAFF_DOMAIN) ? "staff" : "pending";
    const admin = createSupabaseAdminClient();
    if (admin) {
      await admin.from("shop_staff").insert({
        full_name: d.full_name,
        nickname: d.nickname ?? null,
        email,
        role,
        user_id: user.id,
        is_active: true,
      });
      // A failure here is intentionally non-fatal (see the doc comment).
    }
  }

  return { ok: true, message: "verify_email" };
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

  // The user proved email ownership (OTP/reset link) and set a fresh password,
  // so clear any forced-change flag — no need to send them through /ganti-sandi
  // again. Matched by user_id, then email, on the caller's own staff row.
  const clear = { must_change_password: false, updated_at: new Date().toISOString() };
  const byId = await sb
    .from("shop_staff")
    .update(clear)
    .eq("user_id", user.id)
    .select("staff_id");
  if ((!byId.data || byId.data.length === 0) && user.email) {
    await sb.from("shop_staff").update(clear).eq("email", user.email);
  }

  await sb.auth.signOut();
  return { ok: true, message: "password_updated" };
}

// ----------------------------- Activity log --------------------------------
type AuditExportFilters = {
  search?: string;
  module?: string;
  user?: string;
  from?: string;
  to?: string;
};

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/** Build a CSV of audit rows matching the current filters (capped at 5000). */
export async function exportAuditLogsCsv(
  filters: AuditExportFilters,
): Promise<{ ok: boolean; csv?: string; error?: string }> {
  const { sb, error: authErr } = await getAuthedClient();
  if (authErr) return { ok: false, error: authErr };
  let q = sb!
    .from("shop_audit_logs")
    .select("created_at,user_id,user_email,user_name,module,action,description")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (filters.module) q = q.eq("module", filters.module);
  if (filters.user) q = q.ilike("user_email", `%${filters.user}%`);
  if (filters.from) q = q.gte("created_at", `${filters.from}T00:00:00`);
  if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59`);
  if (filters.search) q = q.ilike("description", `%${filters.search}%`);
  const [{ data, error }, staff] = await Promise.all([
    q,
    sb!.from("shop_staff").select("user_id,email,nickname,full_name"),
  ]);
  if (error) return { ok: false, error: error.message };

  // Resolve display name the same way the on-screen log does (nickname >
  // full_name), falling back to the name stored on the row at write time.
  const byUserId = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const s of staff.data ?? []) {
    const name = (s.nickname?.trim() || null) ?? (s.full_name?.trim() || null);
    if (!name) continue;
    if (s.user_id) byUserId.set(s.user_id, name);
    if (s.email) byEmail.set(s.email.toLowerCase().trim(), name);
  }

  const header = ["Waktu", "Email User", "Nama User", "Modul", "Aksi", "Deskripsi"];
  const rows = (data ?? []).map((r) =>
    [
      r.created_at,
      r.user_email ?? "",
      (r.user_id ? byUserId.get(r.user_id) : undefined) ??
        (r.user_email
          ? byEmail.get(r.user_email.toLowerCase().trim())
          : undefined) ??
        r.user_name ??
        "",
      r.module ?? "",
      r.action,
      r.description ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = [header.map(csvCell).join(","), ...rows].join("\n");
  return { ok: true, csv };
}
