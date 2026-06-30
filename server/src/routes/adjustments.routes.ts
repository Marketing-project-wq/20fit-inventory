import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../db/connection.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants.js';
import { newId, documentNumber } from '../utils/id.js';
import { applyMovement } from '../services/stock.service.js';
import { audit } from '../services/audit.service.js';

export const adjustmentsRouter = Router();
adjustmentsRouter.use(authenticate);

function loadAdjustment(id: string) {
  return db
    .prepare(
      `SELECT a.*, v.sku_code, p.name AS product_name, l.name AS location_name,
              ru.name AS requested_by_name, au.name AS approved_by_name
         FROM adjustments a
         JOIN product_variants v ON v.id = a.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN locations l ON l.id = a.location_id
         JOIN users ru ON ru.id = a.requested_by
         LEFT JOIN users au ON au.id = a.approved_by
        WHERE a.id = ?`,
    )
    .get(id);
}

adjustmentsRouter.get(
  '/adjustments',
  asyncHandler(async (req, res) => {
    const { status, type } = req.query as Record<string, string>;
    const where: string[] = [];
    const params: any[] = [];
    if (status) {
      where.push('a.status = ?');
      params.push(status);
    }
    if (type) {
      where.push('a.type = ?');
      params.push(type);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT a.*, v.sku_code, p.name AS product_name, l.name AS location_name,
                ru.name AS requested_by_name, au.name AS approved_by_name
           FROM adjustments a
           JOIN product_variants v ON v.id = a.variant_id
           JOIN products p ON p.id = v.product_id
           JOIN locations l ON l.id = a.location_id
           JOIN users ru ON ru.id = a.requested_by
           LEFT JOIN users au ON au.id = a.approved_by
           ${clause}
          ORDER BY a.created_at DESC`,
      )
      .all(...params);
    res.json(rows);
  }),
);

const adjustmentSchema = z.object({
  type: z.enum(['increase', 'decrease', 'write_off']),
  variant_id: z.string().min(1),
  location_id: z.string().min(1),
  quantity: z.number().int().positive(),
  reason_code: z.string().min(1, 'A reason code is mandatory'), // PRD edge case: block without reason
  notes: z.string().optional(),
});

adjustmentsRouter.post(
  '/adjustments',
  requirePermission(PERMISSIONS.ADJUSTMENT_REQUEST, PERMISSIONS.ADJUSTMENT_APPROVE),
  asyncHandler(async (req, res) => {
    const data = adjustmentSchema.parse(req.body);
    const id = newId();
    const number = documentNumber('ADJ');
    db.prepare(
      `INSERT INTO adjustments (id, adjustment_number, type, variant_id, location_id, quantity, reason_code, status, notes, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(id, number, data.type, data.variant_id, data.location_id, data.quantity, data.reason_code, data.notes ?? null, req.user!.id);
    audit({ userId: req.user!.id, action: 'adjustment_requested', entityType: 'adjustment', entityId: id, after: { number, ...data } });
    res.status(201).json(loadAdjustment(id));
  }),
);

adjustmentsRouter.post(
  '/adjustments/:id/approve',
  requirePermission(PERMISSIONS.ADJUSTMENT_APPROVE),
  asyncHandler(async (req, res) => {
    const adj = db.prepare('SELECT * FROM adjustments WHERE id = ?').get(req.params.id) as any;
    if (!adj) throw ApiError.notFound('Adjustment not found');
    if (adj.status !== 'pending') throw ApiError.conflict('Adjustment already resolved', 'already_resolved');
    // Separation of duties (PRD Section 13): requester cannot approve their own.
    if (adj.requested_by === req.user!.id) {
      throw ApiError.forbidden('You cannot approve an adjustment you requested', 'self_approval');
    }

    const movementType = adj.type === 'increase' ? 'adjustment_in' : adj.type === 'decrease' ? 'adjustment_out' : 'write_off';

    transaction(() => {
      applyMovement({
        variantId: adj.variant_id,
        locationId: adj.location_id,
        movementType,
        quantity: adj.quantity,
        referenceType: 'adjustment',
        referenceId: adj.id,
        reasonCode: adj.reason_code,
        notes: adj.notes,
        performedBy: req.user!.id,
      });
      db.prepare(`UPDATE adjustments SET status = 'approved', approved_by = ?, resolved_at = datetime('now') WHERE id = ?`).run(req.user!.id, adj.id);
      audit({ userId: req.user!.id, action: 'adjustment_approved', entityType: 'adjustment', entityId: adj.id, before: { status: 'pending' }, after: { status: 'approved' } });
    });
    res.json(loadAdjustment(adj.id));
  }),
);

adjustmentsRouter.post(
  '/adjustments/:id/reject',
  requirePermission(PERMISSIONS.ADJUSTMENT_APPROVE),
  asyncHandler(async (req, res) => {
    const adj = db.prepare('SELECT * FROM adjustments WHERE id = ?').get(req.params.id) as any;
    if (!adj) throw ApiError.notFound('Adjustment not found');
    if (adj.status !== 'pending') throw ApiError.conflict('Adjustment already resolved', 'already_resolved');
    db.prepare(`UPDATE adjustments SET status = 'rejected', approved_by = ?, resolved_at = datetime('now') WHERE id = ?`).run(req.user!.id, adj.id);
    audit({ userId: req.user!.id, action: 'adjustment_rejected', entityType: 'adjustment', entityId: adj.id });
    res.json(loadAdjustment(adj.id));
  }),
);
