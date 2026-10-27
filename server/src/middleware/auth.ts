import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/errors";

export interface AuthenticatedRequest extends Request {
  userId?: number;
}

/**
 * Requires a valid `Authorization: Bearer <token>` header.
 * On success the token's userId is attached to the request;
 * otherwise the request fails with 401 in the unified error envelope.
 */
export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(new ApiError(401, "UNAUTHORIZED", "Missing or invalid token"));
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? "") as { userId: number };
    req.userId = payload.userId;
    return next();
  } catch {
    return next(new ApiError(401, "UNAUTHORIZED", "Missing or invalid token"));
  }
}
