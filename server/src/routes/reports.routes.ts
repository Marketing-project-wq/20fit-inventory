import { Router } from 'express';
import { db } from '../db/connection.js';
import { asyncHandler } from '../utils/http.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

// Stock on Hand (PRD 12.1) — filterable by location/category/brand
reportsRouter.get(
  '/reports/stock-on-hand',
  requirePermission(PERMISSIONS.REPORTS_VIEW, PERMISSIONS.STOCK_VIEW),
  asyncHandler(async (req, res) => {
    const { location_id, brand_id, category_id } = req.query as Record<string, string>;
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
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT v.sku_code, p.name AS product_name, b.name AS brand_name,
                c.name_en AS category_name_en, c.name_id AS category_name_id, l.name AS location_name,
                sl.quantity_on_hand, sl.quantity_reserved,
                (sl.quantity_on_hand - sl.quantity_reserved) AS quantity_available, v.unit_of_measure
           FROM stock_levels sl
           JOIN product_variants v ON v.id = sl.variant_id
           JOIN products p ON p.id = v.product_id
           LEFT JOIN brands b ON b.id = p.brand_id
           LEFT JOIN categories c ON c.id = p.category_id
           JOIN locations l ON l.id = sl.location_id
           ${clause}
          ORDER BY p.name, v.sku_code, l.name`,
      )
      .all(...params);
    res.json(rows);
  }),
);

// Inventory Valuation (PRD 12.1 / 8.4 — weighted by recorded cost_price)
reportsRouter.get(
  '/reports/valuation',
  requirePermission(PERMISSIONS.FINANCIAL_VIEW),
  asyncHandler(async (req, res) => {
    const { location_id } = req.query as Record<string, string>;
    const where = location_id ? 'WHERE sl.location_id = ?' : '';
    const params = location_id ? [location_id] : [];
    const rows = db
      .prepare(
        `SELECT v.sku_code, p.name AS product_name, b.name AS brand_name, l.name AS location_name,
                sl.quantity_on_hand, v.cost_price,
                (sl.quantity_on_hand * v.cost_price) AS total_value
           FROM stock_levels sl
           JOIN product_variants v ON v.id = sl.variant_id
           JOIN products p ON p.id = v.product_id
           LEFT JOIN brands b ON b.id = p.brand_id
           JOIN locations l ON l.id = sl.location_id
           ${where}
          ORDER BY total_value DESC`,
      )
      .all(...params) as any[];
    const grandTotal = rows.reduce((sum, r) => sum + (r.total_value ?? 0), 0);
    res.json({ rows, grand_total: grandTotal });
  }),
);

// Low Stock / Reorder (PRD 12.1) — SKUs at or below reorder point
reportsRouter.get(
  '/reports/low-stock',
  requirePermission(PERMISSIONS.REPORTS_VIEW, PERMISSIONS.STOCK_VIEW),
  asyncHandler(async (_req, res) => {
    const rows = db
      .prepare(
        `SELECT v.sku_code, p.name AS product_name, b.name AS brand_name, l.name AS location_name,
                sl.quantity_on_hand, v.reorder_point, v.reorder_quantity,
                CASE WHEN (sl.quantity_on_hand - sl.quantity_reserved) <= 0 THEN 'out_of_stock' ELSE 'low' END AS status
           FROM stock_levels sl
           JOIN product_variants v ON v.id = sl.variant_id
           JOIN products p ON p.id = v.product_id
           LEFT JOIN brands b ON b.id = p.brand_id
           JOIN locations l ON l.id = sl.location_id
          WHERE v.reorder_point IS NOT NULL AND sl.quantity_on_hand <= v.reorder_point
          ORDER BY (sl.quantity_on_hand - v.reorder_point)`,
      )
      .all();
    res.json(rows);
  }),
);

// Fast / Slow mover (PRD 12.1) — ranked by sale volume in a period
reportsRouter.get(
  '/reports/movers',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (req, res) => {
    const days = Math.min(Number((req.query as any).days) || 90, 3650);
    const rows = db
      .prepare(
        `SELECT v.sku_code, p.name AS product_name, b.name AS brand_name,
                COALESCE(SUM(CASE WHEN m.movement_type = 'sale' THEN m.quantity ELSE 0 END), 0) AS units_sold,
                COUNT(CASE WHEN m.movement_type = 'sale' THEN 1 END) AS sale_count
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           LEFT JOIN brands b ON b.id = p.brand_id
           LEFT JOIN stock_movements m ON m.variant_id = v.id AND m.performed_at >= datetime('now', ?)
          WHERE v.is_active = 1
          GROUP BY v.id
          ORDER BY units_sold DESC`,
      )
      .all(`-${days} days`);
    res.json(rows);
  }),
);

// Dead stock (PRD 12.1) — no movement within a period
reportsRouter.get(
  '/reports/dead-stock',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (req, res) => {
    const days = Math.min(Number((req.query as any).days) || 180, 3650);
    const rows = db
      .prepare(
        `SELECT v.sku_code, p.name AS product_name, b.name AS brand_name,
                COALESCE((SELECT SUM(quantity_on_hand) FROM stock_levels sl WHERE sl.variant_id = v.id), 0) AS total_on_hand,
                (SELECT MAX(performed_at) FROM stock_movements m WHERE m.variant_id = v.id) AS last_movement_at
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           LEFT JOIN brands b ON b.id = p.brand_id
          WHERE v.is_active = 1
            AND COALESCE((SELECT SUM(quantity_on_hand) FROM stock_levels sl WHERE sl.variant_id = v.id), 0) > 0
            AND NOT EXISTS (
              SELECT 1 FROM stock_movements m
               WHERE m.variant_id = v.id AND m.performed_at >= datetime('now', ?)
            )
          ORDER BY last_movement_at`,
      )
      .all(`-${days} days`);
    res.json(rows);
  }),
);

// Purchase Order status (PRD 12.1)
reportsRouter.get(
  '/reports/po-status',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (_req, res) => {
    const rows = db
      .prepare(
        `SELECT po.po_number, s.name AS supplier_name, po.status, po.expected_date, po.created_at,
                COALESCE(SUM(pol.quantity_ordered), 0) AS total_ordered,
                COALESCE(SUM(pol.quantity_received), 0) AS total_received,
                CASE WHEN po.expected_date IS NOT NULL AND po.expected_date < date('now')
                          AND po.status NOT IN ('received','cancelled') THEN 1 ELSE 0 END AS overdue
           FROM purchase_orders po
           JOIN suppliers s ON s.id = po.supplier_id
           LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id
          GROUP BY po.id
          ORDER BY po.created_at DESC`,
      )
      .all();
    res.json(rows);
  }),
);

// Write-off / Loss report (PRD 12.1)
reportsRouter.get(
  '/reports/write-offs',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (_req, res) => {
    const rows = db
      .prepare(
        `SELECT m.performed_at, v.sku_code, p.name AS product_name, l.name AS location_name,
                m.quantity, m.reason_code, m.unit_cost, (m.quantity * COALESCE(m.unit_cost, v.cost_price)) AS loss_value,
                u.name AS performed_by_name
           FROM stock_movements m
           JOIN product_variants v ON v.id = m.variant_id
           JOIN products p ON p.id = v.product_id
           JOIN locations l ON l.id = m.location_id
           JOIN users u ON u.id = m.performed_by
          WHERE m.movement_type = 'write_off'
          ORDER BY m.performed_at DESC`,
      )
      .all();
    res.json(rows);
  }),
);
