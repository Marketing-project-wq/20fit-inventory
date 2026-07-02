"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentUser,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export type ActionState = {
  ok: boolean;
  error?: string;
  message?: string;
} | null;

const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().nonnegative().optional(),
);

const stockInSchema = z.object({
  variant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  unit_cost: optionalNumber,
  notes: z.string().trim().max(500).optional(),
});

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

export async function recordStockIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, error: "unauthorized" };
  const parsed = stockInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const sb = createSupabaseAdminClient();
  if (!sb) return { ok: false, error: "not_configured" };

  const d = parsed.data;
  const { error } = await sb.rpc("shop_record_movement", {
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

export async function recordStockOut(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, error: "unauthorized" };
  const parsed = stockOutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const sb = createSupabaseAdminClient();
  if (!sb) return { ok: false, error: "not_configured" };

  const d = parsed.data;
  const { error } = await sb.rpc("shop_record_movement", {
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
    if (error.message.includes("insufficient_stock")) {
      return { ok: false, error: "insufficient_stock" };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "saved" };
}
