import { NextFunction, Request, Response, Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/errors";

const router = Router();

// Defaults confirmed by the user on 2026-10-27 (API SPEC FINAL does not
// define these, so they are fixed here and called out in the PR):
// - Minimum password length: 8 characters.
// - JWT expires after 7 days.
// - Duplicate email on register -> 400 EMAIL_ALREADY_EXISTS.
// - Wrong email OR wrong password on login -> the same 401
//   INVALID_CREDENTIALS, so the response never reveals which one was wrong.
// - Emails are normalised to lowercase before storage/lookup.
const MIN_PASSWORD_LENGTH = 8;
// bcrypt silently truncates passwords longer than 72 bytes, so a longer
// password would create an account the user could never log into with
// the full password. Reject such passwords instead.
const MAX_PASSWORD_BYTES = 72;
const JWT_EXPIRES_IN = "7d";

function publicUser(user: { id: number; email: string; name: string | null }) {
  return { id: user.id, email: user.email, name: user.name };
}

// The token payload must stay { userId } — that is what the skeleton's
// requireAuth middleware (src/middleware/auth.ts) verifies and attaches
// to the request as req.userId.
function signToken(user: { id: number }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new ApiError(500, "SERVER_ERROR", "JWT_SECRET is not configured");
  }
  return jwt.sign({ userId: user.id }, secret, { expiresIn: JWT_EXPIRES_IN });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/auth/register — body { email, password, name? } -> 201 { token, user }
router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name } = req.body ?? {};
    const details: { field: string; message: string }[] = [];

    if (typeof email !== "string" || !isValidEmail(email)) {
      details.push({ field: "email", message: "Email is not valid" });
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      details.push({
        field: "password",
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    } else if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
      details.push({
        field: "password",
        message: `Password must be at most ${MAX_PASSWORD_BYTES} bytes`,
      });
    }
    if (name !== undefined && typeof name !== "string") {
      details.push({ field: "name", message: "Name must be a string" });
    }
    if (details.length > 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid data", details);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new ApiError(400, "EMAIL_ALREADY_EXISTS", "Email is already registered");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: name?.trim() || null,
        },
      });
    } catch (err) {
      // Two concurrent register requests can both pass the findUnique
      // check above; the second one then fails on the unique constraint.
      // Report that as a duplicate email, not a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ApiError(400, "EMAIL_ALREADY_EXISTS", "Email is already registered");
      }
      throw err;
    }

    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/login — body { email, password } -> 200 { token, user }
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body ?? {};
    const details: { field: string; message: string }[] = [];
    // Malformed login data is a client error (400), not a failed login:
    // 401 INVALID_CREDENTIALS is only for well-formed credentials that
    // do not match an account.
    if (typeof email !== "string" || !isValidEmail(email.trim())) {
      details.push({ field: "email", message: "Email is not valid" });
    }
    if (typeof password !== "string" || password.length === 0) {
      details.push({ field: "password", message: "Password is required" });
    }
    if (details.length > 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid data", details);
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !passwordOk) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    return res.status(200).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

export default router;
