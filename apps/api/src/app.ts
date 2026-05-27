import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./auth";
import { initSocket } from "./socket";
import { startSyncJobs } from "./jobs/syncMatches";
import { apiLimiter, authLimiter } from "./middleware/rateLimit";
import { UPLOADS_DIR } from "./services/imageService";

import matchesRouter from "./routes/matches";
import predictionsRouter from "./routes/predictions";
import commentsRouter from "./routes/comments";
import photosRouter from "./routes/photos";
import playersRouter from "./routes/players";
import groupsRouter from "./routes/groups";
import usersRouter from "./routes/users";

const app: express.Application = express();
const httpServer = http.createServer(app);

const isProduction = process.env.NODE_ENV === "production";

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

// CORS — en prod no hace falta si frontend está en el mismo dominio/origin
// pero lo dejamos permisivo para dev
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.BACKEND_URL,
  "http://localhost:5173",
  "http://localhost:3001",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Allow same-origin requests (no origin header) and listed origins
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS not allowed: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── Static files: uploaded photos ────────────────────────────────────────────
app.use("/uploads", express.static(UPLOADS_DIR, {
  maxAge: isProduction ? "7d" : "0",
  etag: true,
}));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Better Auth ──────────────────────────────────────────────────────────────
app.all("/api/auth/*splat", authLimiter, toNodeHandler(auth));

// ─── API routes ───────────────────────────────────────────────────────────────
app.use("/api", apiLimiter);
app.use("/api/matches", matchesRouter);
app.use("/api/predictions", predictionsRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/photos", photosRouter);
app.use("/api/players", playersRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/users", usersRouter);

// ─── Serve React frontend (production, unified deploy on Render) ───────────────
// Build: cd apps/web && pnpm build → output at apps/web/dist
const FRONTEND_DIST = path.join(__dirname, "..", "..", "web", "dist");

if (isProduction) {
  app.use(express.static(FRONTEND_DIST, { maxAge: "1d" }));

  // SPA fallback — all non-API routes serve index.html
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return next();
    }
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
} else {
  // Dev — Vite dev server handles frontend on port 5173
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
}

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Error]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  await initSocket(httpServer);
  startSyncJobs();

  const PORT = parseInt(process.env.PORT ?? "3001", 10);
  httpServer.listen(PORT, () => {
    console.log(`[API] Running on port ${PORT} (${process.env.NODE_ENV ?? "development"})`);
    if (isProduction) {
      console.log(`[API] Serving frontend from ${FRONTEND_DIST}`);
    }
  });
}

start().catch((err) => {
  console.error("[Fatal]", err);
  process.exit(1);
});

export default app;
