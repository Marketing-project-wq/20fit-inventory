import type { Request, Response, NextFunction } from 'express';

/** Application error carrying an HTTP status and a stable error code. */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, code = 'bad_request', details?: unknown) {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(message = 'Authentication required', code = 'unauthorized') {
    return new ApiError(401, code, message);
  }
  static forbidden(message = 'You do not have permission to perform this action', code = 'forbidden') {
    return new ApiError(403, code, message);
  }
  static notFound(message = 'Resource not found', code = 'not_found') {
    return new ApiError(404, code, message);
  }
  static conflict(message: string, code = 'conflict') {
    return new ApiError(409, code, message);
  }
}

/** Wrap an async route handler so thrown errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
