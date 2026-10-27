import { Router, type NextFunction, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { ApiError, type ErrorDetail } from "../utils/errors";
import { prisma } from "../lib/prisma";

const router = Router();
router.use(requireAuth);

type AsyncHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => Promise<void>;

function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as AuthenticatedRequest, res, next).catch(next);
  };
}

function getUserId(req: AuthenticatedRequest): number {
  if (req.userId === undefined) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid token");
  }
  return req.userId;
}

function validationError(details: ErrorDetail[]): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", "Invalid request data", details);
}

function throwIfInvalid(details: ErrorDetail[]): void {
  if (details.length > 0) {
    throw validationError(details);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIntegerParam(
  value: string | undefined,
  field: string,
  details: ErrorDetail[],
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isInteger(parsed)) {
    details.push({ field, message: `${field} must be an integer` });
    return undefined;
  }
  return parsed;
}

interface Pagination {
  page: number;
  limit: number;
}

function parsePagination(
  query: Record<string, string | undefined>,
  details: ErrorDetail[],
): Pagination {
  const page = parseIntegerParam(query.page, "page", details) ?? 1;
  const limit = parseIntegerParam(query.limit, "limit", details) ?? 20;
  if (page < 1) {
    details.push({ field: "page", message: "page must be at least 1" });
  }
  if (limit < 1) {
    details.push({ field: "limit", message: "limit must be at least 1" });
  }
  return { page, limit: Math.min(limit, 100) };
}

function toCategoryResponse(category: {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: category.id,
    name: category.name,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function parseCategoryId(req: AuthenticatedRequest): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    throw new ApiError(404, "NOT_FOUND", "Category not found");
  }
  return id;
}

async function findOwnedCategory(userId: number, id: number) {
  return prisma.category.findFirst({ where: { id, userId } });
}

function validateCategoryName(
  body: Record<string, unknown>,
  isCreate: boolean,
): string | undefined {
  const details: ErrorDetail[] = [];
  let name: string | undefined;
  if ("name" in body || isCreate) {
    const value = body.name;
    if (typeof value !== "string" || value.trim() === "") {
      details.push({ field: "name", message: "Name is required" });
    } else {
      name = value.trim();
    }
  }
  throwIfInvalid(details);
  return name;
}

// GET /api/categories — list with ?search= matching the category name.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const query = req.query as unknown as Record<string, string | undefined>;
    const details: ErrorDetail[] = [];
    const { page, limit } = parsePagination(query, details);
    throwIfInvalid(details);

    const where: Prisma.CategoryWhereInput = { userId };
    if (query.search !== undefined) {
      where.name = { contains: query.search, mode: "insensitive" };
    }

    const [total, categories] = await Promise.all([
      prisma.category.count({ where }),
      prisma.category.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      items: categories.map(toCategoryResponse),
      total,
      page,
      limit,
    });
  }),
);

// POST /api/categories — create.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const body = isRecord(req.body) ? req.body : {};
    const name = validateCategoryName(body, true);
    const category = await prisma.category.create({
      data: { name: name as string, userId },
    });
    res.status(201).json(toCategoryResponse(category));
  }),
);

// GET /api/categories/:id — single category.
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const id = parseCategoryId(req);
    const category = await findOwnedCategory(userId, id);
    if (category === null) {
      throw new ApiError(404, "NOT_FOUND", "Category not found");
    }
    res.json(toCategoryResponse(category));
  }),
);

// PUT /api/categories/:id — partial update.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const id = parseCategoryId(req);
    const existing = await findOwnedCategory(userId, id);
    if (existing === null) {
      throw new ApiError(404, "NOT_FOUND", "Category not found");
    }
    const body = isRecord(req.body) ? req.body : {};
    const name = validateCategoryName(body, false);
    if (name === undefined) {
      res.json(toCategoryResponse(existing));
      return;
    }
    const category = await prisma.category.update({
      where: { id },
      data: { name },
    });
    res.json(toCategoryResponse(category));
  }),
);

// DELETE /api/categories/:id — delete. The schema sets related todos'
// categoryId to null (onDelete: SetNull); todos themselves are kept.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const id = parseCategoryId(req);
    const category = await findOwnedCategory(userId, id);
    if (category === null) {
      throw new ApiError(404, "NOT_FOUND", "Category not found");
    }
    await prisma.category.delete({ where: { id } });
    res.status(204).send();
  }),
);

export default router;
