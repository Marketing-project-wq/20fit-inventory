import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants.js';
import { newId } from '../utils/id.js';
import { audit } from '../services/audit.service.js';

export const usersRouter = Router();
usersRouter.use(authenticate);

// Roles are readable by anyone authenticated (needed for the user form & display).
usersRouter.get(
  '/roles',
  asyncHandler(async (_req, res) => {
    res.json(
      (db.prepare('SELECT id, key, name_en, name_id, description, permissions FROM roles ORDER BY name_en').all() as any[]).map((r) => ({
        ...r,
        permissions: JSON.parse(r.permissions),
      })),
    );
  }),
);

usersRouter.get(
  '/users',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  asyncHandler(async (_req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.is_active, u.assigned_locations, u.last_login_at, u.created_at,
                r.key AS role_key, r.name_en AS role_name_en, r.name_id AS role_name_id
           FROM users u JOIN roles r ON r.id = u.role_id
          ORDER BY u.name`,
      )
      .all() as any[];
    res.json(rows.map((r) => ({ ...r, is_active: !!r.is_active, assigned_locations: JSON.parse(r.assigned_locations) })));
  }),
);

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role_id: z.string().min(1),
  assigned_locations: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

usersRouter.post(
  '/users',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);
    const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(data.role_id);
    if (!role) throw ApiError.badRequest('Invalid role', 'invalid_role');
    const id = newId();
    const hash = await bcrypt.hash(data.password, 10);
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role_id, assigned_locations, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, data.name, data.email, hash, data.role_id, JSON.stringify(data.assigned_locations ?? []), data.is_active === false ? 0 : 1);
    audit({ userId: req.user!.id, action: 'user_created', entityType: 'user', entityId: id, after: { ...data, password: '***' } });
    res.status(201).json(db.prepare('SELECT id, name, email, role_id FROM users WHERE id = ?').get(id));
  }),
);

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role_id: z.string().min(1).optional(),
  assigned_locations: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

usersRouter.patch(
  '/users/:id',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!existing) throw ApiError.notFound('User not found');
    const data = updateUserSchema.parse(req.body);

    const name = data.name ?? existing.name;
    const roleId = data.role_id ?? existing.role_id;
    const assigned = data.assigned_locations ? JSON.stringify(data.assigned_locations) : existing.assigned_locations;
    const isActive = data.is_active === undefined ? existing.is_active : data.is_active ? 1 : 0;
    const hash = data.password ? await bcrypt.hash(data.password, 10) : existing.password_hash;

    db.prepare(
      `UPDATE users SET name = ?, role_id = ?, assigned_locations = ?, is_active = ?, password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(name, roleId, assigned, isActive, hash, req.params.id);
    audit({ userId: req.user!.id, action: 'user_updated', entityType: 'user', entityId: req.params.id, after: { name, roleId, isActive } });
    res.json({ ok: true });
  }),
);
