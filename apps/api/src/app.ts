import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./auth";
import { initSocket } from "./socket";
import { startSyncJobs } from "./jobs/syncMatches";
import { apiLimiter, authLimiter } from "./middleware/rateLimit";

import matchesRouter from "./routes/matches";
import predictionsRouter from "./routes/predictions";
import commentsRouter from "./routes/comments";
import photosRouter from "./routes/photos";
import playersRouter from "./routes/players";
import groupsRouter from "./routes/groups";
import usersRouter from "./routes/users";

const app = express();
const httpServer = http.createServer(app);

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // handled by frontend
  })
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Better Auth (must be before other routes) ────────────────────────────────
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

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Error]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  // Initialize Socket.io with Redis adapter
  await initSocket(httpServer);

  // Start background sync cron jobs
  startSyncJobs();

  const PORT = parseInt(process.env.PORT ?? "3001", 10);
  httpServer.listen(PORT, () => {
    console.log(`[API] Running on port ${PORT} (${process.env.NODE_ENV ?? "development"})`);
  });
}

start().catch((err) => {
  console.error("[Fatal]", err);
  process.exit(1);
});

export default app;
