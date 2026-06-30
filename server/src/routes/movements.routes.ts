import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../db/connection.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { authenticate, requirePermission, hasPermission } from '../middleware/auth.js';
import { PERMISSIONS, RETURN_CONDITIONS } from '../constants.js';
import { applyMovement } from '../services/stock.service.js';
import { audit } from '../services/audit.service.js';

export const movementsRouter = Router();
movementsRouter.use(authenticate);

function stripCost<T extends Record<string, any>>(rows: T[], canSee: boolean): T[] {
  if (canSee) return rows;
  return rows.map((r) => {
    const { unit_cost, ...rest } = r;
    return rest as T;
  });
}

// -------------------------- Stock levels view ------------------------------
movementsRouter.get(
  '/stock-levels',
  asyncHandler(async (req, res) => {
    const { location_id, brand_id, category_id, search } = req.query as Record<string, string>;
    const where: string[] = [];
    const params: any[] = [];
    if (location_id) {
      where.push('sl.location_id = ?');
      params.push(location_id);
    }
    if (brand_id) {
      where.push('p.brand_id = ?');
      params.push(brand_id);
    }
    if (category_id) {
      where.push('p.category_id = ?');
      params.push(category_id);
    }
    if (search) {
      where.push('(v.sku_code LIKE ? OR p.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT sl.id, sl.variant_id, sl.location_id, sl.quantity_on_hand, sl.quantity_reserved,
                (sl.quantity_on_hand - sl.quantity_reserved) AS quantity_available, sl.last_updated_at,
                v.sku_code, v.unit_of_measure, v.reorder_point, v.cost_price,
                p.name AS product_name, b.name AS brand_name, l.name AS location_name, l.type AS location_type,
                CASE
                  WHEN (sl.quantity_on_hand - sl.quantity_reserved) <= 0 THEN 'out_of_stock'
                  WHEN v.reorder_point IS NOT NULL AND sl.quantity_on_hand <= v.reorder_point THEN 'low'
                  ELSE 'ok'
                END AS stock_status
           FROM stock_levels sl
           JOIN product_variants v ON v.id = sl.variant_id
           JOIN products p ON p.id = v.product_id
           LEFT JOIN brands b ON b.id = p.brand_id
           JOIN locations l ON l.id = sl.location_id
           ${clause}
          ORDER BY p.name, v.sku_code, l.name`,
      )
      .all(...params) as any[];
    res.json(stripCost(rows, hasPermission(req, PERMISSIONS.FINANCIAL_VIEW)));
  }),
);

// ----------------------------- Ledger view ---------------------------------
movementsRouter.get(
  '/movements',
  asyncHandler(async (req, res) => {
    const { variant_id, location_id, movement_type, reference_type, from, to, limit } =
      req.query as Record<string, string>;
    const where: string[] = [];
    const params: any[] = [];
    if (variant_id) {
      where.push('m.variant_id = ?');
      params.push(variant_id);
    }
    if (location_id) {
      where.push('m.location_id = ?');
      params.push(location_id);
    }
    if (movement_type) {
      where.push('m.movement_type = ?');
      params.push(movement_type);
    }
    if (reference_type) {
      where.push('m.reference_type = ?');
      params.push(reference_type);
    }
    if (from) {
      where.push('m.performed_at >= ?');
      params.push(from);
    }
    if (to) {
      where.push('m.performed_at <= ?');
      params.push(to + ' 23:59:59');
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const max = Math.min(Number(limit) || 200, 1000);
    const rows = db
      .prepare(
        `SELECT m.*, v.sku_code, p.name AS product_name,
                l.name AS location_name, rl.name AS related_location_name, u.name AS performed_by_name
           FROM stock_movements m
           JOIN product_variants v ON v.id = m.variant_id
           JOIN products p ON p.id = v.product_id
           JOIN locations l ON l.id = m.location_id
           LEFT JOIN locations rl ON rl.id = m.related_location_id
           JOIN users u ON u.id = m.performed_by
           ${clause}
          ORDER BY m.performed_at DESC, m.id DESC
          LIMIT ?`,
      )
      .all(...params, max) as any[];
    res.json(stripCost(rows, hasPermission(req, PERMISSIONS.FINANCIAL_VIEW)));
  }),
);

// --------------------- Ad-hoc stock-in (no PO) FR-3.3 ----------------------
const stockInSchema = z.object({
  variant_id: z.string().min(1),
  location_id: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_cost: z.number().nonnegative().optional(),
  reason: z.string().min(1, 'A reason is required for ad-hoc stock-in'),
  notes: z.string().optional(),
});

movementsRouter.post(
  '/movements/stock-in',
  requirePermission(PERMISSIONS.STOCK_IN),
  asyncHandler(async (req, res) => {
    const data = stockInSchema.parse(req.body);
    const result = transaction(() => {
      const m = applyMovement({
        variantId: data.variant_id,
        locationId: data.location_id,
        movementType: 'adjustment_in',
        quantity: data.quantity,
        unitCost: data.unit_cost ?? null,
        referenceType: 'manual',
        reasonCode: data.reason,
        notes: data.notes ?? null,
        performedBy: req.user!.id,
      });
      audit({ userId: req.user!.id, action: 'adhoc_stock_in', entityType: 'movement', entityId: m.id, after: data });
      return m;
    });
    res.status(201).json(result);
  }),
);

// ------------------------------ Sale FR-4.1 --------------------------------
const saleSchema = z.object({
  variant_id: z.string().min(1),
  location_id: z.string().min(1),
  quantity: z.number().int().positive(),
  channel: z.enum(['b2c', 'b2b', 'pos', 'ecommerce', 'manual']).default('manual'),
  customer_name: z.string().optional(),
  allow_backorder: z.boolean().optional(),
  notes: z.string().optional(),
});

movementsRouter.post(
  '/movements/sale',
  requirePermission(PERMISSIONS.STOCK_OUT_SALE),
  asyncHandler(async (req, res) => {
    const data = saleSchema.parse(req.body);
    // Backorder override is restricted to roles that can manage POs/operations.
    const allowBackorder =
      !!data.allow_backorder &&
      (hasPermission(req, PERMISSIONS.PO_MANAGE) || hasPermission(req, PERMISSIONS.ADJUSTMENT_APPROVE));
    const result = transaction(() => {
      const m = applyMovement({
        variantId: data.variant_id,
        locationId: data.location_id,
        movementType: 'sale',
        quantity: data.quantity,
        referenceType: 'sales_order',
        reasonCode: data.channel,
        notes: data.customer_name ? `${data.channel.toUpperCase()} — ${data.customer_name}` : data.notes ?? null,
        performedBy: req.user!.id,
        allowBackorder,
      });
      audit({ userId: req.user!.id, action: 'sale_recorded', entityType: 'movement', entityId: m.id, after: data });
      return m;
    });
    res.status(201).json(result);
  }),
);

// ---------------------- Customer return FR-3.5 / 9.2 -----------------------
const returnSchema = z.object({
  variant_id: z.string().min(1),
  location_id: z.string().min(1),
  quantity: z.number().int().positive(),
  condition: z.enum(RETURN_CONDITIONS),
  original_reference: z.string().optional(),
  notes: z.string().optional(),
});

movementsRouter.post(
  '/movements/return',
  requirePermission(PERMISSIONS.RETURN),
  asyncHandler(async (req, res) => {
    const data = returnSchema.parse(req.body);
    // Damaged / needs-inspection returns are routed to a quarantine location and
    // are NOT added to sellable stock (PRD 9.2).
    let targetLocation = data.location_id;
    if (data.condition !== 'sellable') {
      const quarantine = db
        .prepare(`SELECT id FROM locations WHERE type = 'quarantine' AND is_active = 1 LIMIT 1`)
        .get() as { id: string } | undefined;
      if (quarantine) targetLocation = quarantine.id;
    }
    const result = transaction(() => {
      const m = applyMovement({
        variantId: data.variant_id,
        locationId: targetLocation,
        movementType: 'return_in',
        quantity: data.quantity,
        referenceType: 'sales_order',
        referenceId: data.original_reference ?? null,
        reasonCode: `return_${data.condition}`,
        notes: data.notes ?? null,
        performedBy: req.user!.id,
      });
      audit({ userId: req.user!.id, action: 'customer_return', entityType: 'movement', entityId: m.id, after: data });
      return m;
    });
    res.status(201).json({ ...result, routed_to_quarantine: targetLocation !== data.location_id });
  }),
);
