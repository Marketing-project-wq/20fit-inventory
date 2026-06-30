import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants.js';
import { newId } from '../utils/id.js';
import { audit } from '../services/audit.service.js';

export const catalogRouter = Router();
catalogRouter.use(authenticate);

// ----------------------------- Brands --------------------------------------
catalogRouter.get(
  '/brands',
  asyncHandler(async (_req, res) => {
    res.json(db.prepare('SELECT * FROM brands ORDER BY name').all());
  }),
);

const brandSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

catalogRouter.post(
  '/brands',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const data = brandSchema.parse(req.body);
    const id = newId();
    db.prepare('INSERT INTO brands (id, name, description, is_active) VALUES (?, ?, ?, ?)').run(
      id,
      data.name,
      data.description ?? null,
      data.is_active === false ? 0 : 1,
    );
    audit({ userId: req.user!.id, action: 'brand_created', entityType: 'brand', entityId: id, after: data });
    res.status(201).json(db.prepare('SELECT * FROM brands WHERE id = ?').get(id));
  }),
);

// --------------------------- Categories ------------------------------------
catalogRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    res.json(db.prepare('SELECT * FROM categories ORDER BY name_en').all());
  }),
);

const categorySchema = z.object({
  name_en: z.string().min(1),
  name_id: z.string().min(1),
  is_active: z.boolean().optional(),
});

catalogRouter.post(
  '/categories',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const data = categorySchema.parse(req.body);
    const id = newId();
    db.prepare('INSERT INTO categories (id, name_en, name_id, is_active) VALUES (?, ?, ?, ?)').run(
      id,
      data.name_en,
      data.name_id,
      data.is_active === false ? 0 : 1,
    );
    audit({ userId: req.user!.id, action: 'category_created', entityType: 'category', entityId: id, after: data });
    res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
  }),
);

// ---------------------------- Locations ------------------------------------
catalogRouter.get(
  '/locations',
  asyncHandler(async (_req, res) => {
    res.json(db.prepare('SELECT * FROM locations ORDER BY name').all());
  }),
);

const locationSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['warehouse', 'showroom', 'consignment', 'in_transit', 'quarantine']),
  address: z.string().optional(),
  is_active: z.boolean().optional(),
});

catalogRouter.post(
  '/locations',
  requirePermission(PERMISSIONS.LOCATION_MANAGE),
  asyncHandler(async (req, res) => {
    const data = locationSchema.parse(req.body);
    const id = newId();
    db.prepare('INSERT INTO locations (id, name, type, address, is_active) VALUES (?, ?, ?, ?, ?)').run(
      id,
      data.name,
      data.type,
      data.address ?? null,
      data.is_active === false ? 0 : 1,
    );
    audit({ userId: req.user!.id, action: 'location_created', entityType: 'location', entityId: id, after: data });
    res.status(201).json(db.prepare('SELECT * FROM locations WHERE id = ?').get(id));
  }),
);

// ---------------------------- Suppliers ------------------------------------
function mapSupplier(row: any) {
  return { ...row, contact_info: JSON.parse(row.contact_info ?? '{}') };
}

catalogRouter.get(
  '/suppliers',
  asyncHandler(async (_req, res) => {
    res.json((db.prepare('SELECT * FROM suppliers ORDER BY name').all() as any[]).map(mapSupplier));
  }),
);

const supplierSchema = z.object({
  name: z.string().min(1),
  contact_info: z
    .object({
      contact_person: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  default_lead_time_days: z.number().int().nonnegative().optional(),
  payment_terms: z.string().optional(),
  is_active: z.boolean().optional(),
});

catalogRouter.post(
  '/suppliers',
  requirePermission(PERMISSIONS.SUPPLIER_MANAGE),
  asyncHandler(async (req, res) => {
    const data = supplierSchema.parse(req.body);
    const id = newId();
    db.prepare(
      `INSERT INTO suppliers (id, name, contact_info, default_lead_time_days, payment_terms, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      data.name,
      JSON.stringify(data.contact_info ?? {}),
      data.default_lead_time_days ?? null,
      data.payment_terms ?? null,
      data.is_active === false ? 0 : 1,
    );
    audit({ userId: req.user!.id, action: 'supplier_created', entityType: 'supplier', entityId: id, after: data });
    res.status(201).json(mapSupplier(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id)));
  }),
);

catalogRouter.patch(
  '/suppliers/:id',
  requirePermission(PERMISSIONS.SUPPLIER_MANAGE),
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
    if (!existing) throw ApiError.notFound('Supplier not found');
    const data = supplierSchema.partial().parse(req.body);
    const merged = { ...(existing as any), ...data };
    db.prepare(
      `UPDATE suppliers SET name = ?, contact_info = ?, default_lead_time_days = ?, payment_terms = ?, is_active = ? WHERE id = ?`,
    ).run(
      merged.name,
      JSON.stringify(data.contact_info ?? JSON.parse((existing as any).contact_info ?? '{}')),
      merged.default_lead_time_days ?? null,
      merged.payment_terms ?? null,
      merged.is_active === false ? 0 : 1,
      req.params.id,
    );
    res.json(mapSupplier(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id)));
  }),
);
