import type { NextFunction, Request, Response } from "express";

export interface ErrorDetail {
  field: string;
  message: string;
}

/**
 * Error carrying an HTTP status and a stable machine-readable code.
 * Serialised by errorHandler into the unified error envelope
 * (see docs/api-spec.md).
 */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: ErrorDetail[];

  constructor(status: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, "NOT_FOUND", "Resource not found"));
}

// Express recognises error handlers by their 4-argument signature.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }
  console.error(err);
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}
