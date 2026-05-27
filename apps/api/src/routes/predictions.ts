import { Router, Request, Response } from "express";
import { z } from "zod";
import { query } from "../db";
import { requireAuth } from "../middleware/auth";
import { predictionLimiter } from "../middleware/rateLimit";
import { withCache } from "../middleware/cache";
import { cache, TTL } from "../services/cacheService";

const router = Router();

const PredictionSchema = z.object({
  matchId: z.number().int().positive(),
  predictedWinner: z.enum(["HOME_TEAM", "AWAY_TEAM", "DRAW"]),
  predictedHomeScore: z.number().int().min(0).max(30).optional().nullable(),
  predictedAwayScore: z.number().int().min(0).max(30).optional().nullable(),
});

// ─── POST /predictions — submit a prediction ──────────────────────────────────
router.post("/", requireAuth, predictionLimiter, async (req: Request, res: Response) => {
  const parsed = PredictionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { matchId, predictedWinner, predictedHomeScore, predictedAwayScore } = parsed.data;

  try {
    // Check match exists and hasn't started yet
    const { rows: matchRows } = await query(
      "SELECT status, utc_date FROM matches WHERE id=$1",
      [matchId]
    );
    if (!matchRows.length) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const match = matchRows[0];
    if (match.status !== "SCHEDULED" && match.status !== "TIMED") {
      res.status(400).json({ error: "Cannot predict after match has started" });
      return;
    }

    const { rows } = await query(
      `INSERT INTO predictions (user_id, match_id, predicted_winner, predicted_home_score, predicted_away_score)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, match_id) DO UPDATE SET
         predicted_winner = EXCLUDED.predicted_winner,
         predicted_home_score = EXCLUDED.predicted_home_score,
         predicted_away_score = EXCLUDED.predicted_away_score
       RETURNING *`,
      [req.user!.id, matchId, predictedWinner, predictedHomeScore ?? null, predictedAwayScore ?? null]
    );

    // Invalidate user ranking caches
    await cache.delPattern(`ranking:friends:${req.user!.id}*`);

    res.status(201).json({ prediction: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /predictions/my — current user's predictions ─────────────────────────
router.get("/my", requireAuth, async (req: Request, res: Response) => {
  const { limit = "20", offset = "0" } = req.query;

  try {
    const { rows } = await query(
      `SELECT p.*,
         m.utc_date, m.status, m.home_score, m.away_score, m.winner,
         ht.name AS home_team_name, ht.crest_url AS home_team_crest,
         at.name AS away_team_name, at.crest_url AS away_team_crest
       FROM predictions p
       JOIN matches m ON m.id = p.match_id
       JOIN teams ht ON ht.id = m.home_team_id
       JOIN teams at ON at.id = m.away_team_id
       WHERE p.user_id = $1
       ORDER BY m.utc_date DESC
       LIMIT $2 OFFSET $3`,
      [req.user!.id, parseInt(limit as string), parseInt(offset as string)]
    );

    res.json({ predictions: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /predictions/ranking/global ──────────────────────────────────────────
router.get(
  "/ranking/global",
  withCache(TTL.RANKING_GLOBAL),
  async (req: Request, res: Response) => {
    const { limit = "50", offset = "0" } = req.query;

    try {
      const { rows } = await query(
        `SELECT u.id, u.name, u.image, u.total_points,
           COUNT(p.id) AS total_predictions,
           SUM(CASE WHEN p.points_earned > 0 THEN 1 ELSE 0 END) AS correct_predictions,
           RANK() OVER (ORDER BY u.total_points DESC) AS rank
         FROM "user" u
         LEFT JOIN predictions p ON p.user_id = u.id AND p.is_scored = true
         GROUP BY u.id
         ORDER BY u.total_points DESC
         LIMIT $1 OFFSET $2`,
        [parseInt(limit as string), parseInt(offset as string)]
      );

      res.json({ ranking: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── GET /predictions/ranking/friends ─────────────────────────────────────────
router.get("/ranking/friends", requireAuth, async (req: Request, res: Response) => {
  const cacheKey = `ranking:friends:${req.user!.id}`;
  const cached = await cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.image, u.total_points,
         COUNT(p.id) AS total_predictions,
         RANK() OVER (ORDER BY u.total_points DESC) AS rank
       FROM "user" u
       LEFT JOIN predictions p ON p.user_id = u.id AND p.is_scored = true
       WHERE u.id = $1
         OR u.id IN (
           SELECT following_id FROM friendships WHERE follower_id = $1
         )
       GROUP BY u.id
       ORDER BY u.total_points DESC`,
      [req.user!.id]
    );

    await cache.set(cacheKey, { ranking: rows }, TTL.RANKING_FRIENDS);
    res.json({ ranking: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /predictions/match/:matchId — all predictions for a match ────────────
router.get("/match/:matchId", withCache(60), async (req: Request, res: Response) => {
  const matchId = parseInt(req.params.matchId, 10);

  try {
    const { rows } = await query(
      `SELECT
         predicted_winner,
         COUNT(*) AS count,
         ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS percentage
       FROM predictions
       WHERE match_id = $1
       GROUP BY predicted_winner`,
      [matchId]
    );

    res.json({ stats: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
