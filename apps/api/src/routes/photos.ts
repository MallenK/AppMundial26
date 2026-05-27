import { Router, Request, Response, NextFunction } from "express";
import { query, withTransaction } from "../db";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { photoLimiter } from "../middleware/rateLimit";
import {
  uploadMiddleware,
  getPublicUrl,
  deletePhoto,
} from "../services/imageService";
import { broadcastNewPhoto } from "../socket";
import { cache } from "../services/cacheService";

const router = Router();

// ─── POST /photos/upload — multipart upload directo ───────────────────────────
// Frontend envía: FormData { file: File, matchId: string, caption?: string }
router.post(
  "/upload",
  requireAuth,
  photoLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    uploadMiddleware.single("file")(req, res, (err) => {
      if (err) { res.status(400).json({ error: err.message }); return; }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const matchId = parseInt(req.body.matchId, 10);
    const caption = req.body.caption?.slice(0, 200) ?? null;

    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    if (isNaN(matchId)) { res.status(400).json({ error: "matchId required" }); return; }

    // Rate limit: max 5 fotos por usuario por partido por hora
    const { rows: photoCount } = await query(
      `SELECT COUNT(*) FROM match_photos
       WHERE user_id=$1 AND match_id=$2 AND created_at > NOW() - INTERVAL '1 hour'`,
      [req.user!.id, matchId]
    );
    if (parseInt(photoCount[0].count) >= 5) {
      deletePhoto(req.file.filename);
      res.status(429).json({ error: "Máx. 5 fotos por partido por hora" });
      return;
    }

    try {
      const url = getPublicUrl(req.file.filename);

      const { rows } = await query(
        `INSERT INTO match_photos (match_id, user_id, r2_key, url, caption)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [matchId, req.user!.id, req.file.filename, url, caption]
      );

      const photo = rows[0];
      broadcastNewPhoto(matchId, { ...photo, userName: req.user!.name, userImage: (req.user as any).image ?? null });
      await cache.delPattern(`api:/api/photos/match/${matchId}*`);
      res.status(201).json({ photo });
    } catch (err: any) {
      deletePhoto(req.file.filename);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── GET /photos/match/:matchId ───────────────────────────────────────────────
router.get("/match/:matchId", optionalAuth, async (req: Request, res: Response) => {
  const matchId = parseInt(String(req.params.matchId), 10);
  const { limit = "20", offset = "0" } = req.query;

  try {
    const { rows } = await query(
      `SELECT p.*, u.name AS user_name, u.image AS user_image,
         ${req.user
           ? `EXISTS(SELECT 1 FROM photo_likes WHERE user_id='${req.user.id}' AND photo_id=p.id) AS user_liked`
           : "false AS user_liked"}
       FROM match_photos p
       JOIN "user" u ON u.id = p.user_id
       WHERE p.match_id=$1 AND p.is_approved=true
       ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
      [matchId, parseInt(String(limit)), parseInt(String(offset))]
    );
    res.json({ photos: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /photos/:id/like ────────────────────────────────────────────────────
router.post("/:id/like", requireAuth, async (req: Request, res: Response) => {
  const photoId = parseInt(String(req.params.id), 10);
  try {
    await withTransaction(async (client) => {
      const { rows: existing } = await client.query(
        "SELECT 1 FROM photo_likes WHERE user_id=$1 AND photo_id=$2",
        [req.user!.id, photoId]
      );
      if (existing.length) {
        await client.query("DELETE FROM photo_likes WHERE user_id=$1 AND photo_id=$2", [req.user!.id, photoId]);
        const { rows } = await client.query(
          "UPDATE match_photos SET likes_count=likes_count-1 WHERE id=$1 RETURNING likes_count",
          [photoId]
        );
        res.json({ liked: false, likesCount: rows[0]?.likes_count ?? 0 });
      } else {
        await client.query("INSERT INTO photo_likes (user_id, photo_id) VALUES ($1,$2)", [req.user!.id, photoId]);
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
  const photoId = parseInt(String(req.params.id), 10);
  try {
    const { rows } = await query("SELECT user_id, r2_key, match_id FROM match_photos WHERE id=$1", [photoId]);
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    if (rows[0].user_id !== req.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }

    deletePhoto(rows[0].r2_key); // r2_key stores the filename
    await query("DELETE FROM match_photos WHERE id=$1", [photoId]);
    await cache.delPattern(`api:/api/photos/match/${rows[0].match_id}*`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
