import { Router } from 'express';
import { db } from '../db/connection.js';
import { asyncHandler } from '../utils/http.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../constants.js';

export const auditRouter = Router();
auditRouter.use(authenticate);

auditRouter.get(
  '/audit-log',
  requirePermission(PERMISSIONS.AUDIT_VIEW),
  asyncHandler(async (req, res) => {
    const { entity_type, action, limit } = req.query as Record<string, string>;
    const where: string[] = [];
    const params: any[] = [];
    if (entity_type) {
      where.push('a.entity_type = ?');
      params.push(entity_type);
    }
    if (action) {
      where.push('a.action = ?');
      params.push(action);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const max = Math.min(Number(limit) || 200, 1000);
    const rows = db
      .prepare(
        `SELECT a.*, u.name AS user_name
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
           ${clause}
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT ?`,
      )
      .all(...params, max);
    res.json(rows);
  }),
);
