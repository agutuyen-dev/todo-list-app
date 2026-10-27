import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../utils/errors";

const router = Router();
router.use(requireAuth);

const notImplemented = () => {
  throw new ApiError(501, "NOT_IMPLEMENTED", "Todos API is not implemented yet");
};

// TODO (feature/backend-tasks): implement per docs/api-spec.md.
// List query: search, status, priority, categoryId, sortBy, order, page, limit.
router.get("/", notImplemented);
router.post("/", notImplemented);
router.get("/:id", notImplemented);
router.put("/:id", notImplemented);
router.delete("/:id", notImplemented);

export default router;
