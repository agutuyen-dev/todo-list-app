import { Router, type NextFunction, type Request, type Response } from "express";
import type { Prisma, Priority, Status } from "@prisma/client";
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

const PRIORITIES: readonly Priority[] = ["LOW", "MEDIUM", "HIGH"];
const STATUSES: readonly Status[] = ["TODO", "IN_PROGRESS", "DONE"];
const SORT_FIELDS = ["dueDate", "createdAt", "priority", "title"] as const;
type SortField = (typeof SORT_FIELDS)[number];

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

type TodoWithCategory = Prisma.TodoGetPayload<{ include: { category: true } }>;

function toTodoResponse(todo: TodoWithCategory) {
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    dueDate: todo.dueDate,
    priority: todo.priority,
    status: todo.status,
    categoryId: todo.categoryId,
    categoryName: todo.category?.name ?? null,
    isOverdue:
      todo.dueDate !== null && todo.dueDate < new Date() && todo.status !== "DONE",
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
  };
}

// SQLite stores the Priority enum as TEXT, so ordering by `priority` in the
// database sorts alphabetically (HIGH, LOW, MEDIUM) instead of the spec's
// enum order (HIGH, MEDIUM, LOW for desc). Priority results are therefore
// sorted in memory by explicit rank (see compareTodosByPriority); do not
// reintroduce a database `orderBy: { priority }`.
const PRIORITY_RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function compareTodosByPriority(
  a: TodoWithCategory,
  b: TodoWithCategory,
  order: "asc" | "desc",
): number {
  const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (rankDiff !== 0) {
    // Rank 0 (HIGH) first for desc, last for asc.
    return order === "desc" ? rankDiff : -rankDiff;
  }
  // Deterministic tie-break: newest first, then highest id first.
  const createdDiff = b.createdAt.getTime() - a.createdAt.getTime();
  if (createdDiff !== 0) {
    return createdDiff;
  }
  return b.id - a.id;
}

function parseTodoId(req: AuthenticatedRequest): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    throw new ApiError(404, "NOT_FOUND", "Todo not found");
  }
  return id;
}

async function findOwnedTodo(userId: number, id: number) {
  return prisma.todo.findFirst({
    where: { id, userId },
    include: { category: true },
  });
}

interface ValidatedTodoBody {
  title?: string;
  description?: string | null;
  dueDate?: Date | null;
  priority?: Priority;
  status?: Status;
  categoryId?: number | null;
  hasCategoryId: boolean;
}

function validateTodoBody(
  body: Record<string, unknown>,
  isCreate: boolean,
): ValidatedTodoBody {
  const details: ErrorDetail[] = [];
  const result: ValidatedTodoBody = { hasCategoryId: false };

  if ("title" in body || isCreate) {
    const title = body.title;
    if (typeof title !== "string" || title.trim() === "") {
      details.push({ field: "title", message: "Title is required" });
    } else {
      result.title = title.trim();
    }
  }

  if ("description" in body) {
    const description = body.description;
    if (description !== null && typeof description !== "string") {
      details.push({
        field: "description",
        message: "description must be a string or null",
      });
    } else {
      result.description = description as string | null;
    }
  }

  if ("dueDate" in body) {
    const dueDate = body.dueDate;
    if (dueDate === null) {
      result.dueDate = null;
    } else if (typeof dueDate !== "string" || Number.isNaN(Date.parse(dueDate))) {
      details.push({
        field: "dueDate",
        message: "dueDate must be a valid ISO date string or null",
      });
    } else {
      result.dueDate = new Date(dueDate);
    }
  }

  if ("priority" in body) {
    const priority = body.priority;
    if (
      typeof priority !== "string" ||
      !(PRIORITIES as readonly string[]).includes(priority)
    ) {
      details.push({
        field: "priority",
        message: "priority must be one of LOW, MEDIUM, HIGH",
      });
    } else {
      result.priority = priority as Priority;
    }
  }

  if ("status" in body) {
    const status = body.status;
    if (
      typeof status !== "string" ||
      !(STATUSES as readonly string[]).includes(status)
    ) {
      details.push({
        field: "status",
        message: "status must be one of TODO, IN_PROGRESS, DONE",
      });
    } else {
      result.status = status as Status;
    }
  }

  if ("categoryId" in body) {
    result.hasCategoryId = true;
    const categoryId = body.categoryId;
    if (categoryId === null) {
      result.categoryId = null;
    } else if (typeof categoryId !== "number" || !Number.isInteger(categoryId)) {
      details.push({
        field: "categoryId",
        message: "categoryId must be an integer or null",
      });
    } else {
      result.categoryId = categoryId;
    }
  }

  throwIfInvalid(details);
  return result;
}

async function assertCategoryOwned(
  userId: number,
  categoryId: number | null | undefined,
  details: ErrorDetail[],
): Promise<void> {
  if (categoryId === null || categoryId === undefined) {
    return;
  }
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  });
  if (category === null) {
    details.push({ field: "categoryId", message: "Category not found" });
  }
}

// GET /api/todos — list with search, filters, sorting and pagination.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const query = req.query as unknown as Record<string, string | undefined>;
    const details: ErrorDetail[] = [];

    let status: Status | undefined;
    if (query.status !== undefined) {
      if (!(STATUSES as readonly string[]).includes(query.status)) {
        details.push({
          field: "status",
          message: "status must be one of TODO, IN_PROGRESS, DONE",
        });
      } else {
        status = query.status as Status;
      }
    }

    let priority: Priority | undefined;
    if (query.priority !== undefined) {
      if (!(PRIORITIES as readonly string[]).includes(query.priority)) {
        details.push({
          field: "priority",
          message: "priority must be one of LOW, MEDIUM, HIGH",
        });
      } else {
        priority = query.priority as Priority;
      }
    }

    const categoryId = parseIntegerParam(query.categoryId, "categoryId", details);

    const { page, limit } = parsePagination(query, details);

    let sortBy: SortField = "createdAt";
    if (query.sortBy !== undefined) {
      if (
        (SORT_FIELDS as readonly string[]).includes(query.sortBy)
      ) {
        sortBy = query.sortBy as SortField;
      } else {
        details.push({
          field: "sortBy",
          message: "sortBy must be one of dueDate, createdAt, priority, title",
        });
      }
    }

    let order: "asc" | "desc" = "desc";
    if (query.order !== undefined) {
      if (query.order === "asc" || query.order === "desc") {
        order = query.order;
      } else {
        details.push({
          field: "order",
          message: "order must be asc or desc",
        });
      }
    }

    throwIfInvalid(details);

    const where: Prisma.TodoWhereInput = { userId };
    if (status !== undefined) {
      where.status = status;
    }
    if (priority !== undefined) {
      where.priority = priority;
    }
    if (categoryId !== undefined) {
      where.categoryId = categoryId;
    }
    if (query.search !== undefined) {
      // No insensitive mode here - Prisma's SQLite StringFilter has no mode
      // property (PostgreSQL-only; TS2353). Plain `contains` on SQLite uses
      // LIKE, which is case-insensitive for ASCII, so search stays
      // case-insensitive without it.
      where.OR = [
        { title: { contains: query.search } },
        { description: { contains: query.search } },
      ];
    }

    const total = await prisma.todo.count({ where });

    let todos: TodoWithCategory[];
    if (sortBy === "priority") {
      // In-memory sort by enum rank (see PRIORITY_RANK). `total` is the full
      // filtered count from above; pagination is applied to the sorted
      // result below, so page/limit/total stay correct.
      const all = await prisma.todo.findMany({
        where,
        include: { category: true },
      });
      all.sort((a, b) => compareTodosByPriority(a, b, order));
      todos = all.slice((page - 1) * limit, (page - 1) * limit + limit);
    } else {
      const orderBy = { [sortBy]: order } as Prisma.TodoOrderByWithRelationInput;
      todos = await prisma.todo.findMany({
        where,
        include: { category: true },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      });
    }

    res.json({
      items: todos.map(toTodoResponse),
      total,
      page,
      limit,
    });
  }),
);

// POST /api/todos — create.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const body = isRecord(req.body) ? req.body : {};
    const validated = validateTodoBody(body, true);

    const details: ErrorDetail[] = [];
    await assertCategoryOwned(userId, validated.categoryId, details);
    throwIfInvalid(details);

    const todo = await prisma.todo.create({
      data: {
        title: validated.title as string,
        description: validated.description ?? null,
        dueDate: validated.dueDate ?? null,
        priority: validated.priority ?? "MEDIUM",
        status: validated.status ?? "TODO",
        userId,
        categoryId: validated.categoryId ?? null,
      },
      include: { category: true },
    });

    res.status(201).json(toTodoResponse(todo));
  }),
);

// GET /api/todos/:id — single todo.
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const id = parseTodoId(req);
    const todo = await findOwnedTodo(userId, id);
    if (todo === null) {
      throw new ApiError(404, "NOT_FOUND", "Todo not found");
    }
    res.json(toTodoResponse(todo));
  }),
);

// PUT /api/todos/:id — partial update.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const id = parseTodoId(req);
    const existing = await findOwnedTodo(userId, id);
    if (existing === null) {
      throw new ApiError(404, "NOT_FOUND", "Todo not found");
    }

    const body = isRecord(req.body) ? req.body : {};
    const validated = validateTodoBody(body, false);

    const details: ErrorDetail[] = [];
    await assertCategoryOwned(userId, validated.categoryId, details);
    throwIfInvalid(details);

    const data: {
      title?: string;
      description?: string | null;
      dueDate?: Date | null;
      priority?: Priority;
      status?: Status;
      categoryId?: number | null;
    } = {};
    if ("title" in body) {
      data.title = validated.title;
    }
    if ("description" in body) {
      data.description = validated.description;
    }
    if ("dueDate" in body) {
      data.dueDate = validated.dueDate;
    }
    if ("priority" in body) {
      data.priority = validated.priority;
    }
    if ("status" in body) {
      data.status = validated.status;
    }
    if (validated.hasCategoryId) {
      data.categoryId = validated.categoryId ?? null;
    }

    if (Object.keys(data).length === 0) {
      res.json(toTodoResponse(existing));
      return;
    }

    const todo = await prisma.todo.update({
      where: { id },
      data,
      include: { category: true },
    });

    res.json(toTodoResponse(todo));
  }),
);

// DELETE /api/todos/:id — delete.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const id = parseTodoId(req);
    const todo = await findOwnedTodo(userId, id);
    if (todo === null) {
      throw new ApiError(404, "NOT_FOUND", "Todo not found");
    }
    await prisma.todo.delete({ where: { id } });
    res.status(204).send();
  }),
);

export default router;
