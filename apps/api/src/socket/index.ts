import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { auth } from "../auth";
// Single Render instance → in-memory adapter is sufficient (no Redis pub/sub needed)

export let io: SocketServer;

// Track connected users per match room (for UI "X watching")
const roomCounters = new Map<string, number>();

export async function initSocket(httpServer: HttpServer): Promise<SocketServer> {
  const allowedOrigins = [
    process.env.FRONTEND_URL ?? "http://localhost:5173",
    process.env.BACKEND_URL ?? "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:3001",
  ].filter(Boolean);

  io = new SocketServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 10000,
    transports: ["websocket", "polling"],
  });

  // Optional: attach user identity if session cookie present
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

    socket.on("disconnect", () => {
      for (const [room] of roomCounters) {
        if (!io.sockets.adapter.rooms.has(room)) {
          roomCounters.set(room, 0);
        }
      }
    });
  });

  console.log("[Socket.io] Initialized (in-memory adapter)");
  return io;
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────

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
