import { Request, Response, NextFunction } from "express";
import { auth } from "../auth";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; name: string; email: string; image?: string | null };
      session?: { id: string };
    }
  }
}

/** Require authenticated user — returns 401 if not. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = session.user as any;
    req.session = session.session as any;
    next();
  } catch (err: any) {
    res.status(401).json({ error: "Unauthorized" });
  }
}

/** Optionally attach user if logged in — allows anonymous access. */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (session) {
      req.user = session.user as any;
      req.session = session.session as any;
    }
  } catch {
    // Ignore — anonymous OK
  }
  next();
}
