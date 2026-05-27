import { Router, Request, Response } from "express";
import { z } from "zod";
import { query } from "../db";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { cache, TTL } from "../services/cacheService";

const router = Router();

// ─── GET /users/:id/profile ───────────────────────────────────────────────────
router.get("/:id/profile", optionalAuth, async (req: Request, res: Response) => {
  const userId = req.params.id;

  try {
    const { rows: userRows } = await query(
      `SELECT id, name, image, bio, total_points, created_at FROM "user" WHERE id=$1`,
      [userId]
    );
    if (!userRows.length) { res.status(404).json({ error: "User not found" }); return; }

    const user = userRows[0];

    // Stats
    const { rows: statsRows } = await query(
      `SELECT
         COUNT(*) AS total_predictions,
         SUM(points_earned) AS total_points_earned,
         SUM(CASE WHEN points_earned > 0 THEN 1 ELSE 0 END) AS correct_predictions,
         SUM(CASE WHEN points_earned = 5 THEN 1 ELSE 0 END) AS exact_scores
       FROM predictions WHERE user_id=$1 AND is_scored=true`,
      [userId]
    );

    // Recent predictions
    const { rows: recentPredictions } = await query(
      `SELECT p.*,
         m.utc_date, m.status, m.home_score, m.away_score,
         ht.name AS home_team_name, ht.tla AS home_team_tla, ht.crest_url AS home_team_crest,
         at.name AS away_team_name, at.tla AS away_team_tla, at.crest_url AS away_team_crest
       FROM predictions p
       JOIN matches m ON m.id = p.match_id
       JOIN teams ht ON ht.id = m.home_team_id
       JOIN teams at ON at.id = m.away_team_id
       WHERE p.user_id=$1
       ORDER BY m.utc_date DESC
       LIMIT 10`,
      [userId]
    );

    // Follower/following counts
    const { rows: socialRows } = await query(
      `SELECT
         (SELECT COUNT(*) FROM friendships WHERE following_id=$1) AS followers,
         (SELECT COUNT(*) FROM friendships WHERE follower_id=$1) AS following`,
      [userId]
    );

    // Is current user following this user?
    let isFollowing = false;
    if (req.user && req.user.id !== userId) {
      const { rows: followRows } = await query(
        "SELECT 1 FROM friendships WHERE follower_id=$1 AND following_id=$2",
        [req.user.id, userId]
      );
      isFollowing = followRows.length > 0;
    }

    res.json({
      user,
      stats: statsRows[0],
      recentPredictions,
      social: { ...socialRows[0], isFollowing },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /users/me — update profile ────────────────────────────────────────
const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  bio: z.string().max(200).optional().nullable(),
});

router.patch("/me", requireAuth, async (req: Request, res: Response) => {
  const parsed = UpdateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (parsed.data.name !== undefined) {
    params.push(parsed.data.name);
    updates.push(`name=$${params.length}`);
  }
  if (parsed.data.bio !== undefined) {
    params.push(parsed.data.bio);
    updates.push(`bio=$${params.length}`);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  params.push(req.user!.id);
  updates.push("updated_at=NOW()");

  try {
    const { rows } = await query(
      `UPDATE "user" SET ${updates.join(",")} WHERE id=$${params.length} RETURNING id, name, image, bio, total_points`,
      params
    );
    res.json({ user: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /users/:id/follow ───────────────────────────────────────────────────
router.post("/:id/follow", requireAuth, async (req: Request, res: Response) => {
  const targetId = req.params.id;
  if (targetId === req.user!.id) {
    res.status(400).json({ error: "Cannot follow yourself" });
    return;
  }

  try {
    const { rows: userRows } = await query("SELECT id FROM \"user\" WHERE id=$1", [targetId]);
    if (!userRows.length) { res.status(404).json({ error: "User not found" }); return; }

    await query(
      `INSERT INTO friendships (follower_id, following_id)
       VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [req.user!.id, targetId]
    );

    // Invalidate friend rankings
    await cache.delPattern(`ranking:friends:${req.user!.id}*`);

    res.json({ following: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /users/:id/follow ─────────────────────────────────────────────────
router.delete("/:id/follow", requireAuth, async (req: Request, res: Response) => {
  const targetId = req.params.id;

  try {
    await query(
      "DELETE FROM friendships WHERE follower_id=$1 AND following_id=$2",
      [req.user!.id, targetId]
    );

    await cache.delPattern(`ranking:friends:${req.user!.id}*`);
    res.json({ following: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /users/:id/followers ─────────────────────────────────────────────────
router.get("/:id/followers", async (req: Request, res: Response) => {
  const { limit = "20", offset = "0" } = req.query;
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.image, u.total_points
       FROM friendships f
       JOIN "user" u ON u.id = f.follower_id
       WHERE f.following_id=$1
       ORDER BY u.total_points DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, parseInt(limit as string), parseInt(offset as string)]
    );
    res.json({ users: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /users/:id/following ─────────────────────────────────────────────────
router.get("/:id/following", async (req: Request, res: Response) => {
  const { limit = "20", offset = "0" } = req.query;
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.image, u.total_points
       FROM friendships f
       JOIN "user" u ON u.id = f.following_id
       WHERE f.follower_id=$1
       ORDER BY u.total_points DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, parseInt(limit as string), parseInt(offset as string)]
    );
    res.json({ users: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
