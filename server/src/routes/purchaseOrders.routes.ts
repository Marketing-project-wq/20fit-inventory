import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../db/connection.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants.js';
import { newId, documentNumber } from '../utils/id.js';
import { applyMovement } from '../services/stock.service.js';
import { audit } from '../services/audit.service.js';

export const poRouter = Router();
poRouter.use(authenticate);

function loadPO(id: string) {
  const po = db
    .prepare(
      `SELECT po.*, s.name AS supplier_name, l.name AS location_name, u.name AS created_by_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         JOIN locations l ON l.id = po.location_id
         JOIN users u ON u.id = po.created_by
        WHERE po.id = ?`,
    )
    .get(id) as any;
  if (!po) return null;
  po.lines = db
    .prepare(
      `SELECT pol.*, v.sku_code, p.name AS product_name
         FROM purchase_order_lines pol
         JOIN product_variants v ON v.id = pol.variant_id
         JOIN products p ON p.id = v.product_id
        WHERE pol.po_id = ?`,
    )
    .all(id);
  return po;
}

poRouter.get(
  '/purchase-orders',
  asyncHandler(async (req, res) => {
    const { status } = req.query as Record<string, string>;
    const where = status ? 'WHERE po.status = ?' : '';
    const rows = db
      .prepare(
        `SELECT po.*, s.name AS supplier_name, l.name AS location_name,
                (SELECT COUNT(*) FROM purchase_order_lines pol WHERE pol.po_id = po.id) AS line_count,
                (SELECT COALESCE(SUM(pol.quantity_ordered * pol.unit_cost),0) FROM purchase_order_lines pol WHERE pol.po_id = po.id) AS total_value
           FROM purchase_orders po
           JOIN suppliers s ON s.id = po.supplier_id
           JOIN locations l ON l.id = po.location_id
           ${where}
          ORDER BY po.created_at DESC`,
      )
      .all(...(status ? [status] : [])) as any[];
    res.json(rows);
  }),
);

poRouter.get(
  '/purchase-orders/:id',
  asyncHandler(async (req, res) => {
    const po = loadPO(req.params.id);
    if (!po) throw ApiError.notFound('Purchase order not found');
    res.json(po);
  }),
);

const poSchema = z.object({
  supplier_id: z.string().min(1),
  location_id: z.string().min(1),
  expected_date: z.string().optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        variant_id: z.string().min(1),
        quantity_ordered: z.number().int().positive(),
        unit_cost: z.number().nonnegative(),
      }),
    )
    .min(1, 'At least one line is required'),
});

poRouter.post(
  '/purchase-orders',
  requirePermission(PERMISSIONS.PO_MANAGE),
  asyncHandler(async (req, res) => {
    const data = poSchema.parse(req.body);
    const id = newId();
    const number = documentNumber('PO');
    transaction(() => {
      db.prepare(
        `INSERT INTO purchase_orders (id, po_number, supplier_id, location_id, status, expected_date, notes, created_by)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
      ).run(id, number, data.supplier_id, data.location_id, data.expected_date ?? null, data.notes ?? null, req.user!.id);
      for (const line of data.lines) {
        db.prepare(
          `INSERT INTO purchase_order_lines (id, po_id, variant_id, quantity_ordered, quantity_received, unit_cost)
           VALUES (?, ?, ?, ?, 0, ?)`,
        ).run(newId(), id, line.variant_id, line.quantity_ordered, line.unit_cost);
      }
      audit({ userId: req.user!.id, action: 'po_created', entityType: 'purchase_order', entityId: id, after: { number, ...data } });
    });
    res.status(201).json(loadPO(id));
  }),
);

const statusSchema = z.object({ status: z.enum(['draft', 'submitted', 'cancelled']) });

poRouter.patch(
  '/purchase-orders/:id/status',
  requirePermission(PERMISSIONS.PO_MANAGE),
  asyncHandler(async (req, res) => {
    const { status } = statusSchema.parse(req.body);
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id) as any;
    if (!po) throw ApiError.notFound('Purchase order not found');
    if (['received', 'partially_received'].includes(po.status)) {
      throw ApiError.conflict('Cannot change status of a PO that has received goods', 'po_locked');
    }
    db.prepare(`UPDATE purchase_orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);
    audit({ userId: req.user!.id, action: 'po_status_changed', entityType: 'purchase_order', entityId: req.params.id, before: { status: po.status }, after: { status } });
    res.json(loadPO(req.params.id));
  }),
);

// --------------------- Goods Receipt (PRD 9.1) -----------------------------
const receiptSchema = z.object({
  lines: z
    .array(z.object({ po_line_id: z.string().min(1), quantity: z.number().int().positive() }))
    .min(1),
});

poRouter.post(
  '/purchase-orders/:id/receive',
  requirePermission(PERMISSIONS.STOCK_IN),
  asyncHandler(async (req, res) => {
    const data = receiptSchema.parse(req.body);
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id) as any;
    if (!po) throw ApiError.notFound('Purchase order not found');
    if (po.status === 'cancelled') throw ApiError.conflict('Cannot receive against a cancelled PO', 'po_cancelled');

    const flags: Array<{ po_line_id: string; over_received: boolean }> = [];

    transaction(() => {
      for (const recv of data.lines) {
        const line = db.prepare('SELECT * FROM purchase_order_lines WHERE id = ? AND po_id = ?').get(recv.po_line_id, po.id) as any;
        if (!line) throw ApiError.badRequest(`PO line ${recv.po_line_id} not found on this PO`, 'invalid_po_line');

        applyMovement({
          variantId: line.variant_id,
          locationId: po.location_id,
          movementType: 'purchase_receipt',
          quantity: recv.quantity,
          unitCost: line.unit_cost,
          referenceType: 'purchase_order',
          referenceId: line.id,
          performedBy: req.user!.id,
        });

        const newReceived = line.quantity_received + recv.quantity;
        db.prepare('UPDATE purchase_order_lines SET quantity_received = ? WHERE id = ?').run(newReceived, line.id);
        // Edge case (PRD 17): allow over-receipt but flag the variance for review.
        if (newReceived > line.quantity_ordered) flags.push({ po_line_id: line.id, over_received: true });
      }

      // Recompute PO status from line fulfilment.
      const lines = db.prepare('SELECT quantity_ordered, quantity_received FROM purchase_order_lines WHERE po_id = ?').all(po.id) as any[];
      const allReceived = lines.every((l) => l.quantity_received >= l.quantity_ordered);
      const anyReceived = lines.some((l) => l.quantity_received > 0);
      const newStatus = allReceived ? 'received' : anyReceived ? 'partially_received' : po.status;
      db.prepare(`UPDATE purchase_orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(newStatus, po.id);

      audit({ userId: req.user!.id, action: 'goods_received', entityType: 'purchase_order', entityId: po.id, after: { lines: data.lines, flags } });
    });

    res.json({ ...loadPO(po.id), variance_flags: flags });
  }),
);
