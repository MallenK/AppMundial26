import { Router, Request, Response } from "express";
import { query } from "../db";
import { withCache } from "../middleware/cache";
import { optionalAuth } from "../middleware/auth";
import {
  getFixtureById,
  getFixtureLineups,
  getFixtureStats,
  getFixtureEvents,
  getLiveFixtures,
  getTodayFixtures,
} from "../services/footballApi";
import { cache, TTL } from "../services/cacheService";
import { z } from "zod";

const router = Router();

const AFL_LEAGUE = parseInt(process.env.AFL_LEAGUE_ID ?? "1");
const AFL_SEASON = parseInt(process.env.AFL_SEASON ?? "2026");

// ─── GET /matches/live ────────────────────────────────────────────────────────
router.get("/live", async (_req: Request, res: Response) => {
  try {
    const fixtures = await getLiveFixtures(AFL_LEAGUE, AFL_SEASON);
    res.json({ matches: fixtures });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /matches/today ───────────────────────────────────────────────────────
router.get("/today", withCache(TTL.TODAY_MATCHES), async (_req: Request, res: Response) => {
  try {
    const fixtures = await getTodayFixtures(AFL_LEAGUE, AFL_SEASON);
    res.json({ matches: fixtures });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /matches — from DB (paginated) ──────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const { status, stage, limit = "20", offset = "0" } = req.query;

  let sql = `
    SELECT m.*,
      ht.name AS home_team_name, ht.crest_url AS home_team_crest,
      ht.tla AS home_team_tla,
      at.name AS away_team_name, at.crest_url AS away_team_crest,
      at.tla AS away_team_tla
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (status) {
    params.push(status);
    sql += ` AND m.status = $${params.length}`;
  }
  if (stage) {
    params.push(stage);
    sql += ` AND m.stage = $${params.length}`;
  }

  params.push(parseInt(String(limit), 10));
  params.push(parseInt(String(offset), 10));
  sql += ` ORDER BY m.utc_date ASC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  try {
    const { rows } = await query(sql, params);
    res.json({ matches: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /matches/:id — full match detail ────────────────────────────────────
router.get("/:id", optionalAuth, async (req: Request, res: Response) => {
  const matchId = parseInt(String(req.params.id), 10);
  if (isNaN(matchId)) {
    res.status(400).json({ error: "Invalid match ID" });
    return;
  }

  try {
    // Get base match from DB
    const { rows } = await query(
      `SELECT m.*,
         ht.name AS home_team_name, ht.crest_url AS home_team_crest, ht.tla AS home_team_tla,
         ht.flag_url AS home_flag_url,
         at.name AS away_team_name, at.crest_url AS away_team_crest, at.tla AS away_team_tla,
         at.flag_url AS away_flag_url
       FROM matches m
       JOIN teams ht ON ht.id = m.home_team_id
       JOIN teams at ON at.id = m.away_team_id
       WHERE m.id = $1`,
      [matchId]
    );

    if (!rows.length) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const match = rows[0];

    // Fetch live data from api-football.com if we have afl_id
    let liveData: any = null;
    let lineups: any[] = [];
    let stats: any[] = [];
    let events: any[] = [];

    if (match.afl_id) {
      [liveData, lineups, stats, events] = await Promise.all([
        getFixtureById(match.afl_id),
        getFixtureLineups(match.afl_id),
        getFixtureStats(match.afl_id),
        getFixtureEvents(match.afl_id),
      ]);
    } else {
      // Fallback: get events from our DB
      const evResult = await query(
        `SELECT me.*, t.name AS team_name, t.crest_url AS team_crest
         FROM match_events me
         LEFT JOIN teams t ON t.id = me.team_id
         WHERE me.match_id = $1
         ORDER BY me.minute ASC`,
        [matchId]
      );
      events = evResult.rows;
    }

    // Get prediction stats for this match (% votes)
    const { rows: predStats } = await query(
      `SELECT
         predicted_winner,
         COUNT(*) AS count
       FROM predictions WHERE match_id = $1
       GROUP BY predicted_winner`,
      [matchId]
    );

    // Get user's prediction if logged in
    let userPrediction = null;
    if (req.user) {
      const { rows: pRows } = await query(
        "SELECT * FROM predictions WHERE match_id=$1 AND user_id=$2",
        [matchId, req.user.id]
      );
      userPrediction = pRows[0] ?? null;
    }

    res.json({
      match,
      liveData,
      lineups,
      stats,
      events,
      predictionStats: predStats,
      userPrediction,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /matches/:id/events ──────────────────────────────────────────────────
router.get("/:id/events", withCache(TTL.LIVE_MATCH), async (req: Request, res: Response) => {
  const matchId = parseInt(String(req.params.id), 10);
  try {
    const { rows: matchRow } = await query(
      "SELECT afl_id FROM matches WHERE id=$1", [matchId]
    );
    if (!matchRow.length) { res.status(404).json({ error: "Not found" }); return; }

    const events = matchRow[0].afl_id
      ? await getFixtureEvents(matchRow[0].afl_id)
      : (await query(
          "SELECT * FROM match_events WHERE match_id=$1 ORDER BY minute ASC",
          [matchId]
        )).rows;

    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /matches/:id/lineups ─────────────────────────────────────────────────
router.get("/:id/lineups", withCache(120), async (req: Request, res: Response) => {
  const matchId = parseInt(String(req.params.id), 10);
  try {
    const { rows } = await query("SELECT afl_id FROM matches WHERE id=$1", [matchId]);
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const lineups = rows[0].afl_id ? await getFixtureLineups(rows[0].afl_id) : [];
    res.json({ lineups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /matches/:id/stats ───────────────────────────────────────────────────
router.get("/:id/stats", withCache(TTL.LIVE_MATCH), async (req: Request, res: Response) => {
  const matchId = parseInt(String(req.params.id), 10);
  try {
    const { rows } = await query("SELECT afl_id FROM matches WHERE id=$1", [matchId]);
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const stats = rows[0].afl_id ? await getFixtureStats(rows[0].afl_id) : [];
    res.json({ stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
