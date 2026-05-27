/**
 * Sync jobs — keep DB in sync with api-football.com live data.
 *
 * Strategy:
 *   - Every 30s: fetch all live fixtures → update DB → broadcast via Socket.io
 *   - Every 5min: fetch today's fixtures (SCHEDULED/FINISHED updates)
 *   - Every 60min: sync standings from football-data.io
 *   - Every 60min: keep-alive ping so Render free tier doesn't sleep
 *
 * api-football.com free = 100 calls/day.
 * Live polling: 30s interval = 2/min × 90 min/match × N matches
 * With 1 live match: 180 calls for the full match = fine.
 * With 4 simultaneous: 4 calls every 30s = 8/min → ~720/match-window → need paid plan.
 *
 * RECOMMENDATION: Upgrade to api-football.com Basic ($10/mo) during the tournament.
 */

import cron from "node-cron";
import { query } from "../db";
import { cache, TTL } from "../services/cacheService";
import {
  getLiveFixtures,
  getFixtureById,
  getFixtureEvents,
  getTodayFixtures,
  getStandings,
  getAllFixtures,
} from "../services/footballApi";
import {
  broadcastMatchUpdate,
  broadcastMatchEvent,
  io,
} from "../socket";

const WORLD_CUP_AFL_LEAGUE = parseInt(process.env.AFL_LEAGUE_ID ?? "1");
const WORLD_CUP_SEASON = parseInt(process.env.AFL_SEASON ?? "2026");

// ─── Sync a single live fixture ──────────────────────────────────────────────

async function syncLiveFixture(aflId: number) {
  try {
    const fixture = await getFixtureById(aflId);
    if (!fixture) return;

    const { fixture: f, goals, score } = fixture;
    const homeScore = goals?.home ?? null;
    const awayScore = goals?.away ?? null;
    const minute = f?.status?.elapsed ?? null;
    const status = mapAflStatus(f?.status?.short);
    const htHome = score?.halftime?.home ?? null;
    const htAway = score?.halftime?.away ?? null;
    const etHome = score?.extratime?.home ?? null;
    const etAway = score?.extratime?.away ?? null;
    const penHome = score?.penalty?.home ?? null;
    const penAway = score?.penalty?.away ?? null;

    // Determine winner
    let winner: string | null = null;
    if (status === "FINISHED") {
      const totalHome = penHome !== null ? penHome : homeScore;
      const totalAway = penAway !== null ? penAway : awayScore;
      if (totalHome !== null && totalAway !== null) {
        winner = totalHome > totalAway ? "HOME_TEAM" : totalAway > totalHome ? "AWAY_TEAM" : "DRAW";
      }
    }

    // Fetch current DB state
    const { rows } = await query(
      "SELECT id, home_score, away_score, minute, status FROM matches WHERE afl_id = $1",
      [aflId]
    );
    if (!rows.length) return;
    const dbMatch = rows[0];

    const scoreChanged =
      dbMatch.home_score !== homeScore ||
      dbMatch.away_score !== awayScore ||
      dbMatch.minute !== minute ||
      dbMatch.status !== status;

    if (scoreChanged) {
      await query(
        `UPDATE matches
         SET home_score=$1, away_score=$2, home_score_ht=$3, away_score_ht=$4,
             home_score_et=$5, away_score_et=$6, home_score_pen=$7, away_score_pen=$8,
             minute=$9, status=$10, winner=$11, last_synced=NOW()
         WHERE afl_id=$12`,
        [homeScore, awayScore, htHome, htAway, etHome, etAway, penHome, penAway,
         minute, status, winner, aflId]
      );

      broadcastMatchUpdate({
        matchId: dbMatch.id,
        homeScore,
        awayScore,
        minute,
        status,
      });

      // Invalidate caches
      await cache.del(`afl:fixture:${aflId}`);
      await cache.del(`afl:today:${WORLD_CUP_AFL_LEAGUE}:${new Date().toISOString().slice(0, 10)}`);
    }

    // Sync events (goals, cards, subs)
    await syncFixtureEvents(dbMatch.id, aflId);

    // Score predictions when match finishes
    if (status === "FINISHED" && dbMatch.status !== "FINISHED") {
      await scoreMatchPredictions(dbMatch.id, homeScore, awayScore, winner);
    }
  } catch (err: any) {
    console.error(`[Sync] Error syncing fixture ${aflId}:`, err.message);
  }
}

// ─── Sync match events ───────────────────────────────────────────────────────

async function syncFixtureEvents(matchId: number, aflId: number) {
  const events = await getFixtureEvents(aflId);
  if (!events?.length) return;

  for (const ev of events) {
    const type = mapAflEventType(ev.type);
    if (!type) continue;

    const { rows: existing } = await query(
      `SELECT id FROM match_events WHERE match_id=$1 AND minute=$2 AND type=$3 AND player_name=$4`,
      [matchId, ev.time?.elapsed ?? 0, type, ev.player?.name ?? null]
    );

    if (!existing.length) {
      const { rows: teamRows } = await query(
        "SELECT id FROM teams WHERE afl_id=$1",
        [ev.team?.id ?? null]
      );
      const teamId = teamRows[0]?.id ?? null;

      await query(
        `INSERT INTO match_events (match_id, minute, extra_time, type, team_id, player_name, assist_name, detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          matchId,
          ev.time?.elapsed ?? 0,
          ev.time?.extra ?? 0,
          type,
          teamId,
          ev.player?.name ?? null,
          ev.assist?.name ?? null,
          ev.detail ?? null,
        ]
      );

      // Broadcast new event
      broadcastMatchEvent(matchId, {
        matchId,
        minute: ev.time?.elapsed,
        type,
        playerName: ev.player?.name,
        assistName: ev.assist?.name,
        teamId,
        detail: ev.detail,
      });
    }
  }
}

// ─── Score predictions after match ends ──────────────────────────────────────

async function scoreMatchPredictions(
  matchId: number,
  homeScore: number | null,
  awayScore: number | null,
  winner: string | null
) {
  if (winner === null) return;

  await query(
    `UPDATE predictions p
     SET points_earned = CASE
       WHEN p.predicted_winner = $1
         AND p.predicted_home_score = $2
         AND p.predicted_away_score = $3 THEN 5
       WHEN p.predicted_winner = $1 THEN 3
       ELSE 0
     END,
     is_scored = true
     WHERE p.match_id = $4 AND p.is_scored = false`,
    [winner, homeScore, awayScore, matchId]
  );

  // Update user total points
  await query(
    `UPDATE "user" u
     SET total_points = (
       SELECT COALESCE(SUM(points_earned), 0)
       FROM predictions WHERE user_id = u.id
     ),
     updated_at = NOW()
     WHERE u.id IN (
       SELECT user_id FROM predictions WHERE match_id = $1
     )`,
    [matchId]
  );

  // Invalidate rankings cache
  await cache.delPattern("ranking:*");

  console.log(`[Sync] Scored predictions for match ${matchId}`);
}

// ─── Sync today's fixtures (schedule updates) ────────────────────────────────

async function syncTodayFixtures() {
  try {
    const fixtures = await getTodayFixtures(WORLD_CUP_AFL_LEAGUE, WORLD_CUP_SEASON);
    for (const f of fixtures) {
      await upsertFixture(f);
    }
    await cache.del(`afl:today:${WORLD_CUP_AFL_LEAGUE}:${new Date().toISOString().slice(0, 10)}`);
  } catch (err: any) {
    console.error("[Sync] Error syncing today fixtures:", err.message);
  }
}

// ─── Upsert fixture into DB ──────────────────────────────────────────────────

async function upsertFixture(f: any) {
  const { fixture, teams, goals, score, league } = f;
  const aflId = fixture.id;
  const utcDate = new Date(fixture.date);
  const status = mapAflStatus(fixture.status?.short);
  const venue = fixture.venue?.name ?? null;
  const referee = fixture.referee ?? null;

  // Ensure teams exist
  const homeTeamId = await ensureTeam(teams.home);
  const awayTeamId = await ensureTeam(teams.away);

  const { rows: compRows } = await query(
    "SELECT id FROM competitions WHERE code = 'WC' LIMIT 1"
  );
  const competitionId = compRows[0]?.id ?? null;

  await query(
    `INSERT INTO matches (afl_id, competition_id, home_team_id, away_team_id, status, stage,
       utc_date, home_score, away_score, home_score_ht, away_score_ht, venue, referee, last_synced)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
     ON CONFLICT (afl_id) DO UPDATE SET
       status=$5, home_score=$8, away_score=$9, home_score_ht=$10, away_score_ht=$11,
       venue=$12, referee=$13, last_synced=NOW()`,
    [
      aflId, competitionId, homeTeamId, awayTeamId,
      status, mapAflRound(league?.round),
      utcDate, goals?.home ?? null, goals?.away ?? null,
      score?.halftime?.home ?? null, score?.halftime?.away ?? null,
      venue, referee,
    ]
  );
}

async function ensureTeam(teamData: { id: number; name: string; logo: string }): Promise<number | null> {
  if (!teamData?.id) return null;
  await query(
    `INSERT INTO teams (afl_id, name, crest_url)
     VALUES ($1,$2,$3)
     ON CONFLICT (afl_id) DO UPDATE SET name=$2, crest_url=$3`,
    [teamData.id, teamData.name, teamData.logo]
  );
  const { rows } = await query("SELECT id FROM teams WHERE afl_id=$1", [teamData.id]);
  return rows[0]?.id ?? null;
}

// ─── Sync standings from football-data.io ────────────────────────────────────

async function syncStandings() {
  try {
    const data = await getStandings("WC");
    await cache.set("fd:standings:WC", data, TTL.STANDINGS);
    console.log("[Sync] Standings refreshed");
  } catch (err: any) {
    console.error("[Sync] Standings error:", err.message);
  }
}

// ─── Keep-alive for Render free tier ─────────────────────────────────────────

async function keepAlive() {
  // Render free instances sleep after 15min of inactivity
  // Ping ourselves to stay awake during tournament
  if (process.env.BACKEND_URL && process.env.NODE_ENV === "production") {
    const url = `${process.env.BACKEND_URL}/health`;
    await fetch(url).catch(() => {});
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapAflStatus(short: string): string {
  const map: Record<string, string> = {
    TBD: "SCHEDULED", NS: "SCHEDULED",
    "1H": "LIVE", HT: "LIVE", "2H": "LIVE",
    ET: "LIVE", BT: "LIVE", P: "LIVE",
    SUSP: "LIVE", INT: "LIVE",
    FT: "FINISHED", AET: "FINISHED", PEN: "FINISHED",
    PST: "POSTPONED", CANC: "CANCELLED", ABD: "CANCELLED",
    AWD: "FINISHED", WO: "FINISHED",
  };
  return map[short] ?? "SCHEDULED";
}

function mapAflEventType(type: string): string | null {
  const map: Record<string, string> = {
    Goal: "GOAL",
    Card: "YELLOW_CARD", // detail will be "Yellow Card" or "Red Card"
    subst: "SUBSTITUTION",
    Var: "VAR",
  };
  return map[type] ?? null;
}

function mapAflRound(round: string): string {
  if (!round) return "GROUP_STAGE";
  if (round.includes("Group")) return "GROUP_STAGE";
  if (round.includes("16")) return "LAST_16";
  if (round.includes("Quarter")) return "QUARTER_FINALS";
  if (round.includes("Semi")) return "SEMI_FINALS";
  if (round.includes("3rd")) return "THIRD_PLACE";
  if (round.includes("Final")) return "FINAL";
  return "GROUP_STAGE";
}

// ─── Cron schedules ──────────────────────────────────────────────────────────

export function startSyncJobs() {
  // Live scores — every 30 seconds
  cron.schedule("*/30 * * * * *", async () => {
    try {
      const liveFixtures = await getLiveFixtures(WORLD_CUP_AFL_LEAGUE, WORLD_CUP_SEASON);
      for (const f of liveFixtures) {
        await syncLiveFixture(f.fixture.id);
      }
    } catch (err: any) {
      console.error("[Cron:live]", err.message);
    }
  });

  // Today's fixtures — every 5 minutes
  cron.schedule("*/5 * * * *", () => syncTodayFixtures());

  // Standings — every hour
  cron.schedule("0 * * * *", () => syncStandings());

  // Keep-alive — every 14 minutes (Render spins down at 15)
  cron.schedule("*/14 * * * *", () => keepAlive());

  console.log("[Cron] Sync jobs started");
}
