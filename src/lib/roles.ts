/**
 * Role hierarchy for 20FIT Shop authorization. Pure module (no server/node
 * imports) so it is safe to import from middleware (edge) and client components.
 *
 * Ranked, highest → lowest:
 *   super_admin > admin > manager > staff > viewer > pending
 * `pending` (rank 0) means the account is authenticated but authorized for
 * NOTHING — it is the state a newly registered / unapproved user sits in.
 */
export type StaffRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "staff"
  | "viewer"
  | "pending";

export const ROLE_RANK: Record<StaffRole, number> = {
  super_admin: 5,
  admin: 4,
  manager: 3,
  staff: 2,
  viewer: 1,
  pending: 0,
};

/** Minimum role required to enter the app at all. Below this → pending screen. */
export const APP_ACCESS_MIN: StaffRole = "viewer";

/** True when `role` is at least `min` in the ranked hierarchy. Null/unknown → false. */
export function roleAtLeast(
  role: StaffRole | null | undefined,
  min: StaffRole,
): boolean {
  if (!role) return false;
  const r = ROLE_RANK[role];
  return r != null && r >= ROLE_RANK[min];
}
