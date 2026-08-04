import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roleAtLeast, type StaffRole } from "@/lib/roles";

/**
 * Server-side authorization guard. The logged-in user's authority comes from an
 * ACTIVE `shop_staff` row with a sufficient role — NOT merely from having an
 * auth session (auth.users is a shared ecosystem pool). Match by `user_id`
 * (backfilled), falling back to email for any not-yet-linked row.
 */
export type CurrentStaff = {
  staff_id: string;
  user_id: string | null;
  email: string | null;
  role: StaffRole;
  is_active: boolean;
};

export async function loadCurrentStaff(
  sb: SupabaseClient,
  user: User,
): Promise<CurrentStaff | null> {
  const cols = "staff_id,user_id,email,role,is_active";
  const byId = await sb
    .from("shop_staff")
    .select(cols)
    .eq("user_id", user.id)
    .maybeSingle();
  let row = byId.data;
  if (!row && user.email) {
    const byEmail = await sb
      .from("shop_staff")
      .select(cols)
      .eq("email", user.email)
      .maybeSingle();
    row = byEmail.data;
  }
  return (row as CurrentStaff) ?? null;
}

export type Guard =
  | { sb: SupabaseClient; user: User; staff: CurrentStaff; error: null }
  | {
      sb: null;
      user: null;
      staff: null;
      error: "not_configured" | "unauthorized" | "forbidden";
    };

/**
 * Require an authenticated user backed by an active shop_staff row whose role is
 * at least `min`. Returns `forbidden` for pending / inactive / under-ranked /
 * unregistered users (defense-in-depth behind the middleware route gate).
 */
export async function requireRole(min: StaffRole): Promise<Guard> {
  const sb = await createSupabaseServerClient();
  if (!sb) return { sb: null, user: null, staff: null, error: "not_configured" };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { sb: null, user: null, staff: null, error: "unauthorized" };
  const staff = await loadCurrentStaff(sb, user);
  if (!staff || !staff.is_active || !roleAtLeast(staff.role, min)) {
    return { sb: null, user: null, staff: null, error: "forbidden" };
  }
  return { sb, user, staff, error: null };
}

type Pair =
  | { sb: SupabaseClient; error: null }
  | { sb: null; error: "not_configured" | "unauthorized" | "forbidden" };

/** Any active staff (viewer or higher) — for self-service actions (e.g. change
 *  own password). Returns the `{ sb, error }` shape used by settings actions. */
export async function requireActiveStaff(): Promise<Pair> {
  const g = await requireRole("viewer");
  return g.error ? { sb: null, error: g.error } : { sb: g.sb, error: null };
}

/** Admin or higher — for master-data / catalog mutations. */
export async function requireAdmin(): Promise<Pair> {
  const g = await requireRole("admin");
  return g.error ? { sb: null, error: g.error } : { sb: g.sb, error: null };
}
