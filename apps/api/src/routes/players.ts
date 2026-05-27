import { Router, Request, Response } from "express";
import { query } from "../db";
import { withCache } from "../middleware/cache";
import { getTopScorers } from "../services/footballApi";
import { TTL } from "../services/cacheService";

const router = Router();

// ─── GET /players — list players with stats ───────────────────────────────────
router.get("/", withCache(TTL.PLAYER_LIST), async (req: Request, res: Response) => {
  const { teamId, position, limit = "50", offset = "0" } = req.query;

  let sql = `
    SELECT p.*,
      t.name AS team_name, t.crest_url AS team_crest, t.tla AS team_tla,
      ps.goals, ps.assists, ps.minutes_played, ps.yellow_cards, ps.red_cards,
      ps.shots, ps.shots_on_target, ps.passes, ps.pass_accuracy
    FROM players p
    JOIN teams t ON t.id = p.team_id
    LEFT JOIN player_stats ps ON ps.player_id = p.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (teamId) { params.push(teamId); sql += ` AND p.team_id = $${params.length}`; }
  if (position) { params.push(position); sql += ` AND p.position = $${params.length}`; }

  params.push(parseInt(limit as string));
  params.push(parseInt(offset as string));
  sql += ` ORDER BY COALESCE(ps.goals, 0) DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  try {
    const { rows } = await query(sql, params);
    res.json({ players: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /players/top-scorers ─────────────────────────────────────────────────
router.get("/top-scorers", withCache(TTL.PLAYER_STATS), async (_req: Request, res: Response) => {
  try {
    const data = await getTopScorers("WC");
    res.json({ scorers: data?.scorers ?? data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /players/:id ─────────────────────────────────────────────────────────
router.get("/:id", withCache(TTL.PLAYER_LIST), async (req: Request, res: Response) => {
  const playerId = parseInt(req.params.id, 10);

  try {
    const { rows } = await query(
      `SELECT p.*,
         t.name AS team_name, t.crest_url AS team_crest, t.tla AS team_tla,
         ps.goals, ps.assists, ps.minutes_played, ps.yellow_cards, ps.red_cards,
         ps.shots, ps.shots_on_target, ps.passes, ps.pass_accuracy
       FROM players p
       JOIN teams t ON t.id = p.team_id
       LEFT JOIN player_stats ps ON ps.player_id = p.id
       WHERE p.id = $1`,
      [playerId]
    );

    if (!rows.length) { res.status(404).json({ error: "Player not found" }); return; }
    res.json({ player: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /players/compare?ids=1,2 ────────────────────────────────────────────
router.get("/compare", withCache(300), async (req: Request, res: Response) => {
  const idsParam = req.query.ids as string;
  if (!idsParam) { res.status(400).json({ error: "ids param required" }); return; }

  const ids = idsParam
    .split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id) && id > 0)
    .slice(0, 4); // max 4 players

  if (ids.length < 2) {
    res.status(400).json({ error: "At least 2 valid player IDs required" });
    return;
  }

  try {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
    const { rows } = await query(
      `SELECT p.*,
         t.name AS team_name, t.crest_url AS team_crest, t.tla AS team_tla,
         ps.goals, ps.assists, ps.minutes_played, ps.yellow_cards, ps.red_cards,
         ps.shots, ps.shots_on_target, ps.passes, ps.pass_accuracy
       FROM players p
       JOIN teams t ON t.id = p.team_id
       LEFT JOIN player_stats ps ON ps.player_id = p.id
       WHERE p.id IN (${placeholders})`,
      ids
    );

    res.json({ players: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
