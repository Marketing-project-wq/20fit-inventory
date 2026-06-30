import { db } from '../db/connection.js';
import { newId } from '../utils/id.js';
import { ApiError } from '../utils/http.js';
import {
  type MovementType,
  movementDirection,
} from '../constants.js';

export interface StockRow {
  id: string;
  variant_id: string;
  location_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
}

export interface MovementInput {
  variantId: string;
  locationId: string;
  relatedLocationId?: string | null;
  movementType: MovementType;
  quantity: number;
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  reasonCode?: string | null;
  notes?: string | null;
  performedBy: string;
  /** Allow stock to go below zero (PRD FR-4.7 backorder override). */
  allowBackorder?: boolean;
}

/** Fetch (or lazily create) the cached stock level row for a variant+location. */
export function ensureStockRow(variantId: string, locationId: string): StockRow {
  const existing = db
    .prepare('SELECT * FROM stock_levels WHERE variant_id = ? AND location_id = ?')
    .get(variantId, locationId) as StockRow | undefined;
  if (existing) return existing;

  const id = newId();
  db.prepare(
    `INSERT INTO stock_levels (id, variant_id, location_id, quantity_on_hand, quantity_reserved)
     VALUES (?, ?, ?, 0, 0)`,
  ).run(id, variantId, locationId);
  return {
    id,
    variant_id: variantId,
    location_id: locationId,
    quantity_on_hand: 0,
    quantity_reserved: 0,
  };
}

export function getAvailable(variantId: string, locationId: string): number {
  const row = db
    .prepare(
      'SELECT quantity_on_hand, quantity_reserved FROM stock_levels WHERE variant_id = ? AND location_id = ?',
    )
    .get(variantId, locationId) as
    | { quantity_on_hand: number; quantity_reserved: number }
    | undefined;
  if (!row) return 0;
  return row.quantity_on_hand - row.quantity_reserved;
}

/**
 * Apply a single stock movement: validate, append to the immutable ledger, and
 * update the cached stock level. MUST be called inside a `transaction()` so the
 * availability check and the write are atomic (PRD Section 17 — race conditions).
 */
export function applyMovement(input: MovementInput): { id: string } {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw ApiError.badRequest('Quantity must be a positive integer', 'invalid_quantity');
  }

  const direction = movementDirection(input.movementType);
  const stock = ensureStockRow(input.variantId, input.locationId);

  if (direction === -1) {
    // Outbound: cannot remove more than is physically on hand (unless override).
    const projected = stock.quantity_on_hand - input.quantity;
    if (projected < 0 && !input.allowBackorder) {
      throw ApiError.conflict(
        `Insufficient stock: on-hand ${stock.quantity_on_hand}, requested ${input.quantity}`,
        'insufficient_stock',
      );
    }
    // A physical removal must not strand reservations beyond what remains.
    const newOnHand = stock.quantity_on_hand - input.quantity;
    if (newOnHand < stock.quantity_reserved && !input.allowBackorder) {
      throw ApiError.conflict(
        'Removal would exceed available (non-reserved) stock',
        'exceeds_available',
      );
    }
  }

  const movementId = newId();
  db.prepare(
    `INSERT INTO stock_movements
       (id, variant_id, location_id, related_location_id, movement_type, quantity,
        unit_cost, reference_type, reference_id, reason_code, notes, performed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    movementId,
    input.variantId,
    input.locationId,
    input.relatedLocationId ?? null,
    input.movementType,
    input.quantity,
    input.unitCost ?? null,
    input.referenceType ?? null,
    input.referenceId ?? null,
    input.reasonCode ?? null,
    input.notes ?? null,
    input.performedBy,
  );

  db.prepare(
    `UPDATE stock_levels
        SET quantity_on_hand = quantity_on_hand + ?,
            last_updated_at = datetime('now')
      WHERE id = ?`,
  ).run(direction * input.quantity, stock.id);

  return { id: movementId };
}

/** Reserve stock for a pending order (PRD FR-4.2). */
export function reserveStock(variantId: string, locationId: string, quantity: number): void {
  const stock = ensureStockRow(variantId, locationId);
  const available = stock.quantity_on_hand - stock.quantity_reserved;
  if (quantity > available) {
    throw ApiError.conflict(
      `Cannot reserve ${quantity}; only ${available} available`,
      'insufficient_available',
    );
  }
  db.prepare(
    `UPDATE stock_levels SET quantity_reserved = quantity_reserved + ?, last_updated_at = datetime('now') WHERE id = ?`,
  ).run(quantity, stock.id);
}

/** Release a prior reservation (on fulfilment or cancellation). */
export function releaseReservation(variantId: string, locationId: string, quantity: number): void {
  const stock = ensureStockRow(variantId, locationId);
  const release = Math.min(quantity, stock.quantity_reserved);
  db.prepare(
    `UPDATE stock_levels SET quantity_reserved = quantity_reserved - ?, last_updated_at = datetime('now') WHERE id = ?`,
  ).run(release, stock.id);
}

/**
 * Recompute every cached stock_levels.on_hand from the movement ledger.
 * The ledger is authoritative (PRD 8.3.4); this repairs any drift.
 */
export function recomputeStockLevels(): number {
  const rows = db
    .prepare(
      `SELECT variant_id, location_id, movement_type, quantity FROM stock_movements`,
    )
    .all() as Array<{
    variant_id: string;
    location_id: string;
    movement_type: MovementType;
    quantity: number;
  }>;

  const totals = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.variant_id}::${r.location_id}`;
    const delta = movementDirection(r.movement_type) * r.quantity;
    totals.set(key, (totals.get(key) ?? 0) + delta);
  }

  let updated = 0;
  for (const [key, onHand] of totals) {
    const [variantId, locationId] = key.split('::');
    const stock = ensureStockRow(variantId, locationId);
    db.prepare(
      `UPDATE stock_levels SET quantity_on_hand = ?, last_updated_at = datetime('now') WHERE id = ?`,
    ).run(onHand, stock.id);
    updated++;
  }
  return updated;
}
