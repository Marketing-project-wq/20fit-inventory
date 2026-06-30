import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/http.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Request validation failed',
        details: err.flatten(),
      },
    });
  }

  // SQLite UNIQUE / constraint violations surface as generic errors.
  const message = err instanceof Error ? err.message : 'Unexpected error';
  if (/UNIQUE constraint failed/i.test(message)) {
    return res.status(409).json({
      error: { code: 'duplicate', message: 'A record with that unique value already exists' },
    });
  }

  console.error('[unhandled error]', err);
  return res.status(500).json({
    error: { code: 'internal_error', message: 'Internal server error' },
  });
}
