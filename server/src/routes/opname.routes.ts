import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../db/connection.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants.js';
import { newId, documentNumber } from '../utils/id.js';
import { applyMovement } from '../services/stock.service.js';
import { audit } from '../services/audit.service.js';

export const opnameRouter = Router();
opnameRouter.use(authenticate);

function loadOpname(id: string) {
  const o = db
    .prepare(
      `SELECT o.*, l.name AS location_name, c.name_en AS category_name_en, c.name_id AS category_name_id,
              cu.name AS created_by_name, au.name AS approved_by_name
         FROM stock_opnames o
         JOIN locations l ON l.id = o.location_id
         LEFT JOIN categories c ON c.id = o.category_id
         JOIN users cu ON cu.id = o.created_by
         LEFT JOIN users au ON au.id = o.approved_by
        WHERE o.id = ?`,
    )
    .get(id) as any;
  if (!o) return null;
  o.lines = db
    .prepare(
      `SELECT ol.*, v.sku_code, p.name AS product_name,
              (CASE WHEN ol.counted_qty IS NULL THEN NULL ELSE ol.counted_qty - ol.expected_qty END) AS variance
         FROM stock_opname_lines ol
         JOIN product_variants v ON v.id = ol.variant_id
         JOIN products p ON p.id = v.product_id
        WHERE ol.opname_id = ?
        ORDER BY p.name, v.sku_code`,
    )
    .all(id);
  return o;
}

opnameRouter.get(
  '/opnames',
  asyncHandler(async (_req, res) => {
    const rows = db
      .prepare(
        `SELECT o.*, l.name AS location_name,
                (SELECT COUNT(*) FROM stock_opname_lines ol WHERE ol.opname_id = o.id) AS line_count
           FROM stock_opnames o JOIN locations l ON l.id = o.location_id
          ORDER BY o.created_at DESC`,
      )
      .all();
    res.json(rows);
  }),
);

opnameRouter.get(
  '/opnames/:id',
  asyncHandler(async (req, res) => {
    const o = loadOpname(req.params.id);
    if (!o) throw ApiError.notFound('Stock opname not found');
    res.json(o);
  }),
);

const createSchema = z.object({
  location_id: z.string().min(1),
  category_id: z.string().optional().nullable(),
  notes: z.string().optional(),
});

// Generate a count sheet of expected quantities (PRD 9.6 step 2).
opnameRouter.post(
  '/opnames',
  requirePermission(PERMISSIONS.OPNAME_MANAGE),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const id = newId();
    const number = documentNumber('OPN');
    const variants = db
      .prepare(
        `SELECT v.id AS variant_id,
                COALESCE((SELECT quantity_on_hand FROM stock_levels sl WHERE sl.variant_id = v.id AND sl.location_id = ?), 0) AS expected
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
          WHERE v.is_active = 1 ${data.category_id ? 'AND p.category_id = ?' : ''}`,
      )
      .all(...(data.category_id ? [data.location_id, data.category_id] : [data.location_id])) as any[];

    if (variants.length === 0) throw ApiError.badRequest('No active variants to count for this scope', 'empty_count');

    transaction(() => {
      db.prepare(
        `INSERT INTO stock_opnames (id, opname_number, location_id, category_id, status, notes, created_by)
         VALUES (?, ?, ?, ?, 'counting', ?, ?)`,
      ).run(id, number, data.location_id, data.category_id ?? null, data.notes ?? null, req.user!.id);
      for (const v of variants) {
        db.prepare(`INSERT INTO stock_opname_lines (id, opname_id, variant_id, expected_qty, counted_qty) VALUES (?, ?, ?, ?, NULL)`).run(
          newId(),
          id,
          v.variant_id,
          v.expected,
        );
      }
      audit({ userId: req.user!.id, action: 'opname_created', entityType: 'stock_opname', entityId: id, after: { number, ...data, lines: variants.length } });
    });
    res.status(201).json(loadOpname(id));
  }),
);

const countSchema = z.object({
  counts: z.array(z.object({ line_id: z.string().min(1), counted_qty: z.number().int().nonnegative() })).min(1),
});

opnameRouter.patch(
  '/opnames/:id/count',
  requirePermission(PERMISSIONS.OPNAME_MANAGE),
  asyncHandler(async (req, res) => {
    const o = db.prepare('SELECT * FROM stock_opnames WHERE id = ?').get(req.params.id) as any;
    if (!o) throw ApiError.notFound('Stock opname not found');
    if (o.status !== 'counting') throw ApiError.conflict('Counts can only be entered while counting', 'invalid_state');
    const { counts } = countSchema.parse(req.body);
    transaction(() => {
      for (const c of counts) {
        db.prepare('UPDATE stock_opname_lines SET counted_qty = ? WHERE id = ? AND opname_id = ?').run(c.counted_qty, c.line_id, o.id);
      }
    });
    res.json(loadOpname(o.id));
  }),
);

opnameRouter.post(
  '/opnames/:id/submit',
  requirePermission(PERMISSIONS.OPNAME_MANAGE),
  asyncHandler(async (req, res) => {
    const o = db.prepare('SELECT * FROM stock_opnames WHERE id = ?').get(req.params.id) as any;
    if (!o) throw ApiError.notFound('Stock opname not found');
    if (o.status !== 'counting') throw ApiError.conflict('Only a counting opname can be submitted', 'invalid_state');
    db.prepare(`UPDATE stock_opnames SET status = 'pending_approval' WHERE id = ?`).run(o.id);
    res.json(loadOpname(o.id));
  }),
);

// Approve: post adjustment movements for every counted variance (PRD 9.6 step 6).
opnameRouter.post(
  '/opnames/:id/approve',
  requirePermission(PERMISSIONS.OPNAME_APPROVE),
  asyncHandler(async (req, res) => {
    const o = db.prepare('SELECT * FROM stock_opnames WHERE id = ?').get(req.params.id) as any;
    if (!o) throw ApiError.notFound('Stock opname not found');
    if (o.status !== 'pending_approval') throw ApiError.conflict('Opname is not awaiting approval', 'invalid_state');
    const lines = db.prepare('SELECT * FROM stock_opname_lines WHERE opname_id = ? AND counted_qty IS NOT NULL').all(o.id) as any[];

    let adjustments = 0;
    transaction(() => {
      for (const line of lines) {
        const variance = line.counted_qty - line.expected_qty;
        if (variance === 0) continue;
        applyMovement({
          variantId: line.variant_id,
          locationId: o.location_id,
          movementType: variance > 0 ? 'adjustment_in' : 'adjustment_out',
          quantity: Math.abs(variance),
          referenceType: 'adjustment',
          referenceId: o.id,
          reasonCode: 'stock_opname',
          performedBy: req.user!.id,
          allowBackorder: true, // counts reflect physical reality; never block
        });
        adjustments++;
      }
      db.prepare(`UPDATE stock_opnames SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?`).run(req.user!.id, o.id);
      audit({ userId: req.user!.id, action: 'opname_approved', entityType: 'stock_opname', entityId: o.id, after: { adjustments } });
    });
    res.json({ ...loadOpname(o.id), adjustments_posted: adjustments });
  }),
);

opnameRouter.post(
  '/opnames/:id/cancel',
  requirePermission(PERMISSIONS.OPNAME_MANAGE),
  asyncHandler(async (req, res) => {
    const o = db.prepare('SELECT * FROM stock_opnames WHERE id = ?').get(req.params.id) as any;
    if (!o) throw ApiError.notFound('Stock opname not found');
    if (o.status === 'approved') throw ApiError.conflict('Approved opname cannot be cancelled', 'invalid_state');
    db.prepare(`UPDATE stock_opnames SET status = 'cancelled' WHERE id = ?`).run(o.id);
    res.json(loadOpname(o.id));
  }),
);
