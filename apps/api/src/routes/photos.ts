import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { photoLimiter } from "../middleware/rateLimit";
import {
  generateR2Key,
  getPresignedUploadUrl,
  deletePhoto,
  getExtensionFromMime,
} from "../services/imageService";
import { broadcastNewPhoto } from "../socket";
import { cache } from "../services/cacheService";

const router = Router();

const PresignSchema = z.object({
  matchId: z.number().int().positive(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const ConfirmSchema = z.object({
  matchId: z.number().int().positive(),
  r2Key: z.string().min(1),
  url: z.string().url(),
  caption: z.string().max(200).optional().nullable(),
});

// ─── POST /photos/presign — get presigned R2 upload URL ───────────────────────
router.post("/presign", requireAuth, photoLimiter, async (req: Request, res: Response) => {
  const parsed = PresignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { matchId, contentType } = parsed.data;

  // Rate limit: max 5 photos per user per match
  const { rows: photoCount } = await query(
    `SELECT COUNT(*) FROM match_photos
     WHERE user_id=$1 AND match_id=$2 AND created_at > NOW() - INTERVAL '1 hour'`,
    [req.user!.id, matchId]
  );
  if (parseInt(photoCount[0].count) >= 5) {
    res.status(429).json({ error: "Max 5 photos per match per hour" });
    return;
  }

  try {
    const ext = getExtensionFromMime(contentType);
    const key = generateR2Key(matchId, req.user!.id, ext);
    const { uploadUrl, publicUrl } = await getPresignedUploadUrl(key, contentType);

    res.json({ uploadUrl, publicUrl, r2Key: key });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /photos/confirm — register uploaded photo in DB ─────────────────────
router.post("/confirm", requireAuth, async (req: Request, res: Response) => {
  const parsed = ConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { matchId, r2Key, url, caption } = parsed.data;

  try {
    const { rows } = await query(
      `INSERT INTO match_photos (match_id, user_id, r2_key, url, caption)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [matchId, req.user!.id, r2Key, url, caption ?? null]
    );

    const photo = rows[0];

    // Broadcast to match room
    broadcastNewPhoto(matchId, {
      ...photo,
      userName: req.user!.name,
      userImage: req.user!.image,
    });

    await cache.delPattern(`api:/api/photos/match/${matchId}*`);
    res.status(201).json({ photo });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /photos/match/:matchId ───────────────────────────────────────────────
router.get("/match/:matchId", optionalAuth, async (req: Request, res: Response) => {
  const matchId = parseInt(req.params.matchId, 10);
  const { limit = "20", offset = "0" } = req.query;

  try {
    const { rows } = await query(
      `SELECT p.*,
         u.name AS user_name,
         u.image AS user_image,
         ${req.user
           ? `EXISTS(SELECT 1 FROM photo_likes WHERE user_id='${req.user.id}' AND photo_id=p.id) AS user_liked`
           : "false AS user_liked"}
       FROM match_photos p
       JOIN "user" u ON u.id = p.user_id
       WHERE p.match_id=$1 AND p.is_approved=true
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [matchId, parseInt(limit as string), parseInt(offset as string)]
    );

    res.json({ photos: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /photos/:id/like ────────────────────────────────────────────────────
router.post("/:id/like", requireAuth, async (req: Request, res: Response) => {
  const photoId = parseInt(req.params.id, 10);

  try {
    await withTransaction(async (client) => {
      const { rows: existing } = await client.query(
        "SELECT 1 FROM photo_likes WHERE user_id=$1 AND photo_id=$2",
        [req.user!.id, photoId]
      );

      if (existing.length) {
        await client.query(
          "DELETE FROM photo_likes WHERE user_id=$1 AND photo_id=$2",
          [req.user!.id, photoId]
        );
        const { rows } = await client.query(
          "UPDATE match_photos SET likes_count=likes_count-1 WHERE id=$1 RETURNING likes_count",
          [photoId]
        );
        res.json({ liked: false, likesCount: rows[0]?.likes_count ?? 0 });
      } else {
        await client.query(
          "INSERT INTO photo_likes (user_id, photo_id) VALUES ($1,$2)",
          [req.user!.id, photoId]
        );
        const { rows } = await client.query(
          "UPDATE match_photos SET likes_count=likes_count+1 WHERE id=$1 RETURNING likes_count",
          [photoId]
        );
        res.json({ liked: true, likesCount: rows[0]?.likes_count ?? 0 });
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /photos/:id ───────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const photoId = parseInt(req.params.id, 10);

  try {
    const { rows } = await query(
      "SELECT user_id, r2_key, match_id FROM match_photos WHERE id=$1",
      [photoId]
    );
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    if (rows[0].user_id !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await deletePhoto(rows[0].r2_key);
    await query("DELETE FROM match_photos WHERE id=$1", [photoId]);
    await cache.delPattern(`api:/api/photos/match/${rows[0].match_id}*`);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
