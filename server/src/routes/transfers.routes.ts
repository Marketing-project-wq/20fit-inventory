import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../db/connection.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants.js';
import { newId, documentNumber } from '../utils/id.js';
import { applyMovement } from '../services/stock.service.js';
import { audit } from '../services/audit.service.js';

export const transfersRouter = Router();
transfersRouter.use(authenticate);

function loadTransfer(id: string) {
  const t = db
    .prepare(
      `SELECT t.*, sl.name AS source_name, dl.name AS destination_name, u.name AS created_by_name
         FROM transfer_orders t
         JOIN locations sl ON sl.id = t.source_location_id
         JOIN locations dl ON dl.id = t.destination_location_id
         JOIN users u ON u.id = t.created_by
        WHERE t.id = ?`,
    )
    .get(id) as any;
  if (!t) return null;
  t.lines = db
    .prepare(
      `SELECT tl.*, v.sku_code, p.name AS product_name
         FROM transfer_order_lines tl
         JOIN product_variants v ON v.id = tl.variant_id
         JOIN products p ON p.id = v.product_id
        WHERE tl.transfer_id = ?`,
    )
    .all(id);
  return t;
}

transfersRouter.get(
  '/transfers',
  asyncHandler(async (_req, res) => {
    const rows = db
      .prepare(
        `SELECT t.*, sl.name AS source_name, dl.name AS destination_name,
                (SELECT COUNT(*) FROM transfer_order_lines tl WHERE tl.transfer_id = t.id) AS line_count
           FROM transfer_orders t
           JOIN locations sl ON sl.id = t.source_location_id
           JOIN locations dl ON dl.id = t.destination_location_id
          ORDER BY t.created_at DESC`,
      )
      .all();
    res.json(rows);
  }),
);

transfersRouter.get(
  '/transfers/:id',
  asyncHandler(async (req, res) => {
    const t = loadTransfer(req.params.id);
    if (!t) throw ApiError.notFound('Transfer not found');
    res.json(t);
  }),
);

const transferSchema = z.object({
  source_location_id: z.string().min(1),
  destination_location_id: z.string().min(1),
  notes: z.string().optional(),
  lines: z.array(z.object({ variant_id: z.string().min(1), quantity: z.number().int().positive() })).min(1),
});

transfersRouter.post(
  '/transfers',
  requirePermission(PERMISSIONS.TRANSFER),
  asyncHandler(async (req, res) => {
    const data = transferSchema.parse(req.body);
    if (data.source_location_id === data.destination_location_id) {
      throw ApiError.badRequest('Source and destination must differ', 'same_location');
    }
    const id = newId();
    const number = documentNumber('TRF');
    transaction(() => {
      db.prepare(
        `INSERT INTO transfer_orders (id, transfer_number, source_location_id, destination_location_id, status, notes, created_by)
         VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
      ).run(id, number, data.source_location_id, data.destination_location_id, data.notes ?? null, req.user!.id);
      for (const line of data.lines) {
        db.prepare(`INSERT INTO transfer_order_lines (id, transfer_id, variant_id, quantity) VALUES (?, ?, ?, ?)`).run(
          newId(),
          id,
          line.variant_id,
          line.quantity,
        );
      }
      audit({ userId: req.user!.id, action: 'transfer_created', entityType: 'transfer_order', entityId: id, after: { number, ...data } });
    });
    res.status(201).json(loadTransfer(id));
  }),
);

// Dispatch: remove stock from source, mark in-transit (PRD 9.5 step 2a).
transfersRouter.post(
  '/transfers/:id/dispatch',
  requirePermission(PERMISSIONS.TRANSFER),
  asyncHandler(async (req, res) => {
    const t = db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(req.params.id) as any;
    if (!t) throw ApiError.notFound('Transfer not found');
    if (t.status !== 'draft') throw ApiError.conflict('Only draft transfers can be dispatched', 'invalid_state');
    const lines = db.prepare('SELECT * FROM transfer_order_lines WHERE transfer_id = ?').all(t.id) as any[];

    transaction(() => {
      for (const line of lines) {
        applyMovement({
          variantId: line.variant_id,
          locationId: t.source_location_id,
          relatedLocationId: t.destination_location_id,
          movementType: 'transfer_out',
          quantity: line.quantity,
          referenceType: 'transfer_order',
          referenceId: t.id,
          performedBy: req.user!.id,
        });
      }
      db.prepare(`UPDATE transfer_orders SET status = 'in_transit', dispatched_at = datetime('now') WHERE id = ?`).run(t.id);
      audit({ userId: req.user!.id, action: 'transfer_dispatched', entityType: 'transfer_order', entityId: t.id });
    });
    res.json(loadTransfer(t.id));
  }),
);

// Receive: add stock at destination, mark completed (PRD 9.5 step 2b).
transfersRouter.post(
  '/transfers/:id/receive',
  requirePermission(PERMISSIONS.TRANSFER),
  asyncHandler(async (req, res) => {
    const t = db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(req.params.id) as any;
    if (!t) throw ApiError.notFound('Transfer not found');
    if (t.status !== 'in_transit') throw ApiError.conflict('Only in-transit transfers can be received', 'invalid_state');
    const lines = db.prepare('SELECT * FROM transfer_order_lines WHERE transfer_id = ?').all(t.id) as any[];

    transaction(() => {
      for (const line of lines) {
        applyMovement({
          variantId: line.variant_id,
          locationId: t.destination_location_id,
          relatedLocationId: t.source_location_id,
          movementType: 'transfer_in',
          quantity: line.quantity,
          referenceType: 'transfer_order',
          referenceId: t.id,
          performedBy: req.user!.id,
        });
      }
      db.prepare(`UPDATE transfer_orders SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).run(t.id);
      audit({ userId: req.user!.id, action: 'transfer_received', entityType: 'transfer_order', entityId: t.id });
    });
    res.json(loadTransfer(t.id));
  }),
);

transfersRouter.post(
  '/transfers/:id/cancel',
  requirePermission(PERMISSIONS.TRANSFER),
  asyncHandler(async (req, res) => {
    const t = db.prepare('SELECT * FROM transfer_orders WHERE id = ?').get(req.params.id) as any;
    if (!t) throw ApiError.notFound('Transfer not found');
    if (t.status !== 'draft') throw ApiError.conflict('Only draft transfers can be cancelled', 'invalid_state');
    db.prepare(`UPDATE transfer_orders SET status = 'cancelled' WHERE id = ?`).run(t.id);
    res.json(loadTransfer(t.id));
  }),
);
