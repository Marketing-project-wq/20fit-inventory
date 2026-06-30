import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { audit } from '../services/audit.service.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface UserAuthRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  is_active: number;
  role_key: string;
  role_name_en: string;
  role_name_id: string;
  permissions: string;
  assigned_locations: string;
}

function publicUser(row: UserAuthRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: {
      key: row.role_key,
      name_en: row.role_name_en,
      name_id: row.role_name_id,
    },
    permissions: JSON.parse(row.permissions),
    assignedLocations: JSON.parse(row.assigned_locations),
  };
}

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.password_hash, u.is_active, u.assigned_locations,
                r.key AS role_key, r.name_en AS role_name_en, r.name_id AS role_name_id, r.permissions
           FROM users u JOIN roles r ON r.id = u.role_id
          WHERE lower(u.email) = lower(?)`,
      )
      .get(email) as UserAuthRow | undefined;

    // Constant-ish failure: same error whether the user exists or not.
    if (!row || !row.is_active) {
      throw ApiError.unauthorized('Invalid email or password', 'invalid_credentials');
    }
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      throw ApiError.unauthorized('Invalid email or password', 'invalid_credentials');
    }

    db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(row.id);
    audit({ userId: row.id, action: 'user_login', entityType: 'user', entityId: row.id });

    const token = signToken(row.id);
    res.json({ token, user: publicUser(row) });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.password_hash, u.is_active, u.assigned_locations,
                r.key AS role_key, r.name_en AS role_name_en, r.name_id AS role_name_id, r.permissions
           FROM users u JOIN roles r ON r.id = u.role_id
          WHERE u.id = ?`,
      )
      .get(req.user!.id) as unknown as UserAuthRow;
    res.json({ user: publicUser(row) });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

authRouter.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const row = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.user!.id) as { password_hash: string };

    const ok = await bcrypt.compare(currentPassword, row.password_hash);
    if (!ok) throw ApiError.badRequest('Current password is incorrect', 'wrong_password');

    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
      hash,
      req.user!.id,
    );
    audit({ userId: req.user!.id, action: 'password_changed', entityType: 'user', entityId: req.user!.id });
    res.json({ ok: true });
  }),
);
