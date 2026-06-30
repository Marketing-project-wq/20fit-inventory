import { Router } from 'express';
import { db } from '../db/connection.js';
import { asyncHandler } from '../utils/http.js';
import { authenticate, hasPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

// Management dashboard KPIs (PRD 12.2).
dashboardRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const canSeeValue = hasPermission(req, PERMISSIONS.FINANCIAL_VIEW);

    const totalValue = db
      .prepare(
        `SELECT COALESCE(SUM(sl.quantity_on_hand * v.cost_price), 0) AS value
           FROM stock_levels sl JOIN product_variants v ON v.id = sl.variant_id`,
      )
      .get() as { value: number };

    const skuCount = db.prepare('SELECT COUNT(*) AS c FROM product_variants WHERE is_active = 1').get() as { c: number };

    const belowReorder = db
      .prepare(
        `SELECT COUNT(*) AS c FROM (
           SELECT v.id FROM product_variants v
           JOIN stock_levels sl ON sl.variant_id = v.id
          WHERE v.reorder_point IS NOT NULL AND sl.quantity_on_hand <= v.reorder_point
          GROUP BY v.id
         )`,
      )
      .get() as { c: number };

    const outOfStock = db
      .prepare(
        `SELECT COUNT(*) AS c FROM (
           SELECT v.id FROM product_variants v
           WHERE v.is_active = 1
             AND COALESCE((SELECT SUM(quantity_on_hand - quantity_reserved) FROM stock_levels sl WHERE sl.variant_id = v.id), 0) <= 0
         )`,
      )
      .get() as { c: number };

    const openPOs = db
      .prepare(
        `SELECT po.po_number, s.name AS supplier_name, po.status, po.expected_date,
                CASE WHEN po.expected_date IS NOT NULL AND po.expected_date < date('now') THEN 1 ELSE 0 END AS overdue
           FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
          WHERE po.status IN ('submitted', 'partially_received')
          ORDER BY po.expected_date LIMIT 10`,
      )
      .all();

    const lowStockWatchlist = db
      .prepare(
        `SELECT v.sku_code, p.name AS product_name, l.name AS location_name,
                sl.quantity_on_hand, v.reorder_point
           FROM stock_levels sl
           JOIN product_variants v ON v.id = sl.variant_id
           JOIN products p ON p.id = v.product_id
           JOIN locations l ON l.id = sl.location_id
          WHERE v.reorder_point IS NOT NULL AND sl.quantity_on_hand <= v.reorder_point
          ORDER BY (sl.quantity_on_hand - v.reorder_point) LIMIT 10`,
      )
      .all();

    const topMovers = db
      .prepare(
        `SELECT v.sku_code, p.name AS product_name,
                COALESCE(SUM(m.quantity), 0) AS units_sold
           FROM stock_movements m
           JOIN product_variants v ON v.id = m.variant_id
           JOIN products p ON p.id = v.product_id
          WHERE m.movement_type = 'sale' AND m.performed_at >= datetime('now', '-90 days')
          GROUP BY v.id ORDER BY units_sold DESC LIMIT 10`,
      )
      .all();

    const recentAdjustments = db
      .prepare(
        `SELECT m.performed_at, v.sku_code, p.name AS product_name, m.movement_type, m.quantity,
                m.reason_code, (m.quantity * COALESCE(m.unit_cost, v.cost_price)) AS value, u.name AS performed_by_name
           FROM stock_movements m
           JOIN product_variants v ON v.id = m.variant_id
           JOIN products p ON p.id = v.product_id
           JOIN users u ON u.id = m.performed_by
          WHERE m.movement_type IN ('write_off', 'adjustment_in', 'adjustment_out')
          ORDER BY m.performed_at DESC LIMIT 8`,
      )
      .all();

    const pendingApprovals = db.prepare(`SELECT COUNT(*) AS c FROM adjustments WHERE status = 'pending'`).get() as { c: number };

    res.json({
      total_inventory_value: canSeeValue ? totalValue.value : null,
      sku_count: skuCount.c,
      below_reorder_count: belowReorder.c,
      out_of_stock_count: outOfStock.c,
      pending_approvals: pendingApprovals.c,
      open_purchase_orders: openPOs,
      low_stock_watchlist: lowStockWatchlist,
      top_movers: topMovers,
      recent_adjustments: canSeeValue ? recentAdjustments : (recentAdjustments as any[]).map(({ value, ...r }) => r),
    });
  }),
);
