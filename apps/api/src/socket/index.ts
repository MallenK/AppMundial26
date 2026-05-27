import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { auth } from "../auth";

export let io: SocketServer;

// Track connected users per match room (for UI "X watching")
const roomCounters = new Map<string, number>();

export async function initSocket(httpServer: HttpServer): Promise<SocketServer> {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 10000,
    transports: ["websocket", "polling"],
  });

  // Redis pub/sub adapter — enables horizontal scaling across server instances
  try {
    const pubClient = createClient({ url: process.env.UPSTASH_REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log("[Socket.io] Redis adapter connected");
  } catch (err: any) {
    console.warn("[Socket.io] Redis adapter failed, using in-memory:", err.message);
    // Falls back to in-memory adapter — fine for single instance
  }

  // Optional: auth middleware (only validate if token provided)
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        const session = await auth.api.getSession({
          headers: new Headers({ cookie: `better-auth.session_token=${token}` }),
        });
        if (session) {
          (socket as any).userId = session.user.id;
          (socket as any).userName = session.user.name;
          (socket as any).userImage = session.user.image;
        }
      } catch {
        // Anonymous connection — still allowed
      }
    }
    next();
  });

  io.on("connection", (socket: Socket) => {
    const userId = (socket as any).userId as string | undefined;

    // ── Match room ──────────────────────────────────────────
    socket.on("match:join", (matchId: number) => {
      const room = `match:${matchId}`;
      socket.join(room);
      roomCounters.set(room, (roomCounters.get(room) ?? 0) + 1);
      io.to(room).emit("room:count", { matchId, count: roomCounters.get(room) });
    });

    socket.on("match:leave", (matchId: number) => {
      const room = `match:${matchId}`;
      socket.leave(room);
      const count = Math.max((roomCounters.get(room) ?? 1) - 1, 0);
      roomCounters.set(room, count);
      io.to(room).emit("room:count", { matchId, count });
    });

    // ── Disconnect cleanup ───────────────────────────────────
    socket.on("disconnect", () => {
      // Socket.io auto-removes from rooms; update counters
      for (const [room, count] of roomCounters) {
        if (!io.sockets.adapter.rooms.has(room)) {
          roomCounters.set(room, 0);
        }
      }
    });
  });

  console.log("[Socket.io] Initialized");
  return io;
}

// ── Broadcast helpers (called from sync jobs / route handlers) ────────────────

export function broadcastMatchUpdate(payload: {
  matchId: number;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  status: string;
}) {
  io?.to(`match:${payload.matchId}`).emit("match:update", payload);
}

export function broadcastMatchEvent(matchId: number, event: unknown) {
  io?.to(`match:${matchId}`).emit("match:event", event);
}

export function broadcastNewComment(matchId: number, comment: unknown) {
  io?.to(`match:${matchId}`).emit("comment:new", comment);
}

export function broadcastCommentLike(matchId: number, commentId: number, likesCount: number) {
  io?.to(`match:${matchId}`).emit("comment:like", { commentId, likesCount });
}

export function broadcastNewPhoto(matchId: number, photo: unknown) {
  io?.to(`match:${matchId}`).emit("photo:new", photo);
}
