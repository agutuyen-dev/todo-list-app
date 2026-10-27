import { Router } from "express";
import { ApiError } from "../utils/errors";

const router = Router();

// POST /api/auth/register — body: { name?, email, password }
// → 201 { token, user }. Passwords are hashed with bcrypt before storage.
// TODO (feature/backend-auth): implement register.
router.post("/register", () => {
  throw new ApiError(501, "NOT_IMPLEMENTED", "Register is not implemented yet");
});

// POST /api/auth/login — body: { email, password }
// → 200 { token, user }
// TODO (feature/backend-auth): implement login.
router.post("/login", () => {
  throw new ApiError(501, "NOT_IMPLEMENTED", "Login is not implemented yet");
});

export default router;
