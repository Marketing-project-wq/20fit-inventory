import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { authenticate, requirePermission, hasPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants.js';
import { newId } from '../utils/id.js';
import { audit } from '../services/audit.service.js';

export const productsRouter = Router();
productsRouter.use(authenticate);

function mapVariant(row: any, canSeeCost: boolean) {
  const v = {
    ...row,
    variant_attributes: JSON.parse(row.variant_attributes ?? '{}'),
    requires_serial_tracking: !!row.requires_serial_tracking,
    is_active: !!row.is_active,
  };
  if (!canSeeCost) delete v.cost_price;
  return v;
}

// ------------------------------ Products -----------------------------------
productsRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const { brand_id, category_id, status, search } = req.query as Record<string, string>;
    const where: string[] = [];
    const params: any[] = [];
    if (brand_id) {
      where.push('p.brand_id = ?');
      params.push(brand_id);
    }
    if (category_id) {
      where.push('p.category_id = ?');
      params.push(category_id);
    }
    if (status === 'active') where.push('p.is_active = 1');
    if (status === 'inactive') where.push('p.is_active = 0');
    if (search) {
      where.push('(p.name LIKE ? OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.sku_code LIKE ?))');
      params.push(`%${search}%`, `%${search}%`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT p.*, b.name AS brand_name, c.name_en AS category_name_en, c.name_id AS category_name_id,
                (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count,
                COALESCE((SELECT SUM(sl.quantity_on_hand) FROM product_variants v
                          JOIN stock_levels sl ON sl.variant_id = v.id WHERE v.product_id = p.id), 0) AS total_on_hand
           FROM products p
           LEFT JOIN brands b ON b.id = p.brand_id
           LEFT JOIN categories c ON c.id = p.category_id
           ${clause}
          ORDER BY p.name`,
      )
      .all(...params) as any[];
    res.json(rows.map((r) => ({ ...r, is_active: !!r.is_active })));
  }),
);

productsRouter.get(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const product = db
      .prepare(
        `SELECT p.*, b.name AS brand_name, c.name_en AS category_name_en, c.name_id AS category_name_id
           FROM products p
           LEFT JOIN brands b ON b.id = p.brand_id
           LEFT JOIN categories c ON c.id = p.category_id
          WHERE p.id = ?`,
      )
      .get(req.params.id) as any;
    if (!product) throw ApiError.notFound('Product not found');

    const canSeeCost = hasPermission(req, PERMISSIONS.FINANCIAL_VIEW);
    const variants = (
      db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sku_code').all(req.params.id) as any[]
    ).map((v) => {
      const stock = db
        .prepare(
          `SELECT sl.*, l.name AS location_name, l.type AS location_type,
                  (sl.quantity_on_hand - sl.quantity_reserved) AS quantity_available
             FROM stock_levels sl JOIN locations l ON l.id = sl.location_id
            WHERE sl.variant_id = ?`,
        )
        .all(v.id);
      return { ...mapVariant(v, canSeeCost), stock };
    });

    res.json({ ...product, is_active: !!product.is_active, variants });
  }),
);

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  brand_id: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

productsRouter.post(
  '/products',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const data = productSchema.parse(req.body);
    const id = newId();
    db.prepare(
      `INSERT INTO products (id, name, description, brand_id, category_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, data.name, data.description ?? null, data.brand_id ?? null, data.category_id ?? null, data.is_active === false ? 0 : 1);
    audit({ userId: req.user!.id, action: 'product_created', entityType: 'product', entityId: id, after: data });
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
  }),
);

productsRouter.patch(
  '/products/:id',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw ApiError.notFound('Product not found');
    const data = productSchema.partial().parse(req.body);

    // Edge case (PRD 17): block deactivation while on-hand stock remains.
    if (data.is_active === false && existing.is_active) {
      const onHand = db
        .prepare(
          `SELECT COALESCE(SUM(sl.quantity_on_hand),0) AS qty
             FROM product_variants v JOIN stock_levels sl ON sl.variant_id = v.id
            WHERE v.product_id = ?`,
        )
        .get(req.params.id) as { qty: number };
      if (onHand.qty > 0) {
        throw ApiError.conflict(
          `Cannot deactivate product with ${onHand.qty} units still on hand`,
          'product_has_stock',
        );
      }
    }

    const merged = { ...existing, ...data };
    db.prepare(
      `UPDATE products SET name = ?, description = ?, brand_id = ?, category_id = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(
      merged.name,
      merged.description ?? null,
      merged.brand_id ?? null,
      merged.category_id ?? null,
      merged.is_active ? 1 : 0,
      req.params.id,
    );
    audit({ userId: req.user!.id, action: 'product_updated', entityType: 'product', entityId: req.params.id, before: existing, after: merged });
    res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
  }),
);

// ------------------------------ Variants -----------------------------------
const variantSchema = z.object({
  product_id: z.string().min(1),
  sku_code: z.string().min(1),
  barcode: z.string().optional().nullable(),
  variant_attributes: z.record(z.string()).optional(),
  unit_of_measure: z.string().default('pcs'),
  cost_price: z.number().nonnegative().default(0),
  selling_price: z.number().nonnegative().default(0),
  reorder_point: z.number().int().nonnegative().optional().nullable(),
  reorder_quantity: z.number().int().nonnegative().optional().nullable(),
  min_stock: z.number().int().nonnegative().optional().nullable(),
  max_stock: z.number().int().nonnegative().optional().nullable(),
  requires_serial_tracking: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

productsRouter.get(
  '/variants',
  asyncHandler(async (req, res) => {
    const { search, location_id, low_stock } = req.query as Record<string, string>;
    const canSeeCost = hasPermission(req, PERMISSIONS.FINANCIAL_VIEW);
    const where: string[] = [];
    const params: any[] = [];
    if (search) {
      where.push('(v.sku_code LIKE ? OR v.barcode LIKE ? OR p.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT v.*, p.name AS product_name, b.name AS brand_name,
                c.name_en AS category_name_en, c.name_id AS category_name_id,
                COALESCE((SELECT SUM(quantity_on_hand) FROM stock_levels sl WHERE sl.variant_id = v.id), 0) AS total_on_hand,
                COALESCE((SELECT SUM(quantity_reserved) FROM stock_levels sl WHERE sl.variant_id = v.id), 0) AS total_reserved
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           LEFT JOIN brands b ON b.id = p.brand_id
           LEFT JOIN categories c ON c.id = p.category_id
           ${clause}
          ORDER BY p.name, v.sku_code`,
      )
      .all(...params) as any[];

    let mapped = rows.map((r) => ({
      ...mapVariant(r, canSeeCost),
      total_available: r.total_on_hand - r.total_reserved,
    }));

    if (low_stock === 'true') {
      mapped = mapped.filter(
        (v: any) => v.reorder_point != null && v.total_on_hand <= v.reorder_point,
      );
    }
    res.json(mapped);
  }),
);

productsRouter.get(
  '/variants/:id',
  asyncHandler(async (req, res) => {
    const canSeeCost = hasPermission(req, PERMISSIONS.FINANCIAL_VIEW);
    const v = db
      .prepare(
        `SELECT v.*, p.name AS product_name, b.name AS brand_name,
                c.name_en AS category_name_en, c.name_id AS category_name_id
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           LEFT JOIN brands b ON b.id = p.brand_id
           LEFT JOIN categories c ON c.id = p.category_id
          WHERE v.id = ?`,
      )
      .get(req.params.id) as any;
    if (!v) throw ApiError.notFound('Variant not found');

    const stock = db
      .prepare(
        `SELECT sl.*, l.name AS location_name, l.type AS location_type,
                (sl.quantity_on_hand - sl.quantity_reserved) AS quantity_available
           FROM stock_levels sl JOIN locations l ON l.id = sl.location_id
          WHERE sl.variant_id = ? ORDER BY l.name`,
      )
      .all(req.params.id);

    res.json({ ...mapVariant(v, canSeeCost), stock });
  }),
);

productsRouter.post(
  '/variants',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const data = variantSchema.parse(req.body);
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(data.product_id);
    if (!product) throw ApiError.badRequest('Parent product does not exist', 'invalid_product');

    // FR-1.1 / edge case: selling price cannot be negative; zero allowed only for samples.
    const id = newId();
    db.prepare(
      `INSERT INTO product_variants
        (id, product_id, sku_code, barcode, variant_attributes, unit_of_measure, cost_price, selling_price,
         reorder_point, reorder_quantity, min_stock, max_stock, requires_serial_tracking, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      data.product_id,
      data.sku_code,
      data.barcode ?? null,
      JSON.stringify(data.variant_attributes ?? {}),
      data.unit_of_measure,
      data.cost_price,
      data.selling_price,
      data.reorder_point ?? null,
      data.reorder_quantity ?? null,
      data.min_stock ?? null,
      data.max_stock ?? null,
      data.requires_serial_tracking ? 1 : 0,
      data.is_active === false ? 0 : 1,
    );
    audit({ userId: req.user!.id, action: 'variant_created', entityType: 'variant', entityId: id, after: data });
    res.status(201).json(mapVariant(db.prepare('SELECT * FROM product_variants WHERE id = ?').get(id), true));
  }),
);

productsRouter.patch(
  '/variants/:id',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw ApiError.notFound('Variant not found');
    const data = variantSchema.partial().parse(req.body);
    const merged = { ...existing, ...data };
    db.prepare(
      `UPDATE product_variants SET
         sku_code = ?, barcode = ?, variant_attributes = ?, unit_of_measure = ?, cost_price = ?, selling_price = ?,
         reorder_point = ?, reorder_quantity = ?, min_stock = ?, max_stock = ?, requires_serial_tracking = ?, is_active = ?,
         updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      merged.sku_code,
      merged.barcode ?? null,
      JSON.stringify(data.variant_attributes ?? JSON.parse(existing.variant_attributes ?? '{}')),
      merged.unit_of_measure,
      merged.cost_price,
      merged.selling_price,
      merged.reorder_point ?? null,
      merged.reorder_quantity ?? null,
      merged.min_stock ?? null,
      merged.max_stock ?? null,
      merged.requires_serial_tracking ? 1 : 0,
      merged.is_active ? 1 : 0,
      req.params.id,
    );
    audit({ userId: req.user!.id, action: 'variant_updated', entityType: 'variant', entityId: req.params.id, before: existing, after: merged });
    res.json(mapVariant(db.prepare('SELECT * FROM product_variants WHERE id = ?').get(req.params.id), true));
  }),
);
