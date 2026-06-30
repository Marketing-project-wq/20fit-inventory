import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/connection.js';
import { ApiError } from '../utils/http.js';
import type { Permission } from '../constants.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roleKey: string;
  roleId: string;
  permissions: Permission[];
  assignedLocations: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'insecure-dev-secret';

export function signToken(userId: string): string {
  const options = { expiresIn: process.env.JWT_EXPIRES_IN ?? '12h' } as jwt.SignOptions;
  return jwt.sign({ sub: userId }, JWT_SECRET, options);
}

function loadUser(userId: string): AuthUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.is_active, u.assigned_locations,
              r.id AS role_id, r.key AS role_key, r.permissions
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?`,
    )
    .get(userId) as
    | {
        id: string;
        name: string;
        email: string;
        is_active: number;
        assigned_locations: string;
        role_id: string;
        role_key: string;
        permissions: string;
      }
    | undefined;

  if (!row || !row.is_active) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    roleKey: row.role_key,
    roleId: row.role_id,
    permissions: JSON.parse(row.permissions) as Permission[],
    assignedLocations: JSON.parse(row.assigned_locations) as string[],
  };
}

/** Require a valid bearer token; attaches req.user. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized());
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = loadUser(payload.sub);
    if (!user) return next(ApiError.unauthorized('User no longer active', 'inactive_user'));
    req.user = user;
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired token', 'invalid_token'));
  }
}

/** Require that the authenticated user holds at least one of the given permissions. */
export function requirePermission(...allowed: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    const ok = allowed.some((p) => req.user!.permissions.includes(p));
    if (!ok) {
      return next(
        ApiError.forbidden(
          `Requires one of: ${allowed.join(', ')}`,
          'missing_permission',
        ),
      );
    }
    next();
  };
}

export function hasPermission(req: Request, permission: Permission): boolean {
  return !!req.user?.permissions.includes(permission);
}
