import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { commentLimiter } from "../middleware/rateLimit";
import { cache, TTL } from "../services/cacheService";
import { broadcastNewComment, broadcastCommentLike } from "../socket";

const router = Router();

const CommentSchema = z.object({
  content: z.string().min(1).max(500),
  parentId: z.number().int().positive().optional().nullable(),
});

// ─── GET /comments/match/:matchId ─────────────────────────────────────────────
router.get("/match/:matchId", optionalAuth, async (req: Request, res: Response) => {
  const matchId = parseInt(String(req.params.matchId), 10);
  const { limit = "30", offset = "0", parentId } = req.query;

  try {
    let sql = `
      SELECT c.*,
        u.name AS user_name,
        u.image AS user_image,
        ${req.user ? `EXISTS(
          SELECT 1 FROM comment_likes
          WHERE user_id = '${req.user.id}' AND comment_id = c.id
        ) AS user_liked,` : "false AS user_liked,"}
        (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id AND r.is_deleted = false) AS reply_count
      FROM comments c
      JOIN "user" u ON u.id = c.user_id
      WHERE c.match_id = $1 AND c.is_deleted = false
    `;
    const params: any[] = [matchId];

    if (parentId && parentId !== "null") {
      params.push(parseInt(String(parentId)));
      sql += ` AND c.parent_id = $${params.length}`;
    } else {
      sql += ` AND c.parent_id IS NULL`;
    }

    params.push(parseInt(String(limit)));
    params.push(parseInt(String(offset)));
    sql += ` ORDER BY c.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows } = await query(sql, params);
    res.json({ comments: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /comments/match/:matchId ────────────────────────────────────────────
router.post(
  "/match/:matchId",
  requireAuth,
  commentLimiter,
  async (req: Request, res: Response) => {
    const matchId = parseInt(String(req.params.matchId), 10);
    const parsed = CommentSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { content, parentId } = parsed.data;

    try {
      // Verify match exists
      const { rows: matchRows } = await query("SELECT id FROM matches WHERE id=$1", [matchId]);
      if (!matchRows.length) {
        res.status(404).json({ error: "Match not found" });
        return;
      }

      // Verify parent exists if replying
      if (parentId) {
        const { rows: parentRows } = await query(
          "SELECT id FROM comments WHERE id=$1 AND match_id=$2 AND is_deleted=false",
          [parentId, matchId]
        );
        if (!parentRows.length) {
          res.status(404).json({ error: "Parent comment not found" });
          return;
        }
      }

      const { rows } = await query(
        `INSERT INTO comments (match_id, user_id, parent_id, content)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [matchId, req.user!.id, parentId ?? null, content]
      );

      const comment = rows[0];

      // Broadcast to all watching the match
      const payload = {
        id: comment.id,
        matchId,
        userId: req.user!.id,
        userName: req.user!.name,
        userImage: req.user!.image ?? null,
        content,
        parentId: parentId ?? null,
        likesCount: 0,
        createdAt: comment.created_at,
      };
      broadcastNewComment(matchId, payload);

      // Invalidate comment cache
      await cache.delPattern(`api:/api/comments/match/${matchId}*`);

      res.status(201).json({ comment: { ...comment, ...payload } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── POST /comments/:id/like ──────────────────────────────────────────────────
router.post("/:id/like", requireAuth, async (req: Request, res: Response) => {
  const commentId = parseInt(String(req.params.id), 10);

  try {
    await withTransaction(async (client) => {
      // Toggle like
      const { rows: existing } = await client.query(
        "SELECT 1 FROM comment_likes WHERE user_id=$1 AND comment_id=$2",
        [req.user!.id, commentId]
      );

      let likesCount: number;

      if (existing.length) {
        // Unlike
        await client.query(
          "DELETE FROM comment_likes WHERE user_id=$1 AND comment_id=$2",
          [req.user!.id, commentId]
        );
        const { rows } = await client.query(
          "UPDATE comments SET likes_count = likes_count - 1 WHERE id=$1 RETURNING likes_count, match_id",
          [commentId]
        );
        likesCount = rows[0]?.likes_count ?? 0;
        const matchId = rows[0]?.match_id;
        broadcastCommentLike(matchId, commentId, likesCount);
        res.json({ liked: false, likesCount });
      } else {
        // Like
        await client.query(
          "INSERT INTO comment_likes (user_id, comment_id) VALUES ($1,$2)",
          [req.user!.id, commentId]
        );
        const { rows } = await client.query(
          "UPDATE comments SET likes_count = likes_count + 1 WHERE id=$1 RETURNING likes_count, match_id",
          [commentId]
        );
        likesCount = rows[0]?.likes_count ?? 0;
        const matchId = rows[0]?.match_id;
        broadcastCommentLike(matchId, commentId, likesCount);
        res.json({ liked: true, likesCount });
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /comments/:id ─────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const commentId = parseInt(String(req.params.id), 10);

  try {
    const { rows } = await query(
      "SELECT user_id, match_id FROM comments WHERE id=$1",
      [commentId]
    );
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    if (rows[0].user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await query(
      "UPDATE comments SET is_deleted=true, content='[deleted]' WHERE id=$1",
      [commentId]
    );

    await cache.delPattern(`api:/api/comments/match/${rows[0].match_id}*`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
