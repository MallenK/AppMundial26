/**
 * Dual API strategy:
 *   - api-football.com (AFL) → LIVE scores, fixture events, real-time data
 *   - football-data.io  (FD)  → static data: standings, squads, player stats
 *
 * api-football.com free tier: 100 calls/day via RapidAPI
 * We conserve calls by:
 *   1. Caching all responses in Redis
 *   2. Only polling live fixtures during match windows
 *   3. Rate-limiting the queue to 1 call / 2s
 */

import axios, { AxiosInstance } from "axios";
import { cache, TTL } from "./cacheService";

// ─── API-Football.com client (for LIVE data) ─────────────────────────────────

const aflClient: AxiosInstance = axios.create({
  baseURL: "https://api-football-v1.p.rapidapi.com/v3",
  headers: {
    "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
    "x-rapidapi-key": process.env.API_FOOTBALL_KEY ?? "",
  },
  timeout: 10_000,
});

// ─── Football-Data.org client (for static data) ──────────────────────────────

const fdClient: AxiosInstance = axios.create({
  baseURL: "https://api.football-data.org/v4",
  headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_KEY ?? "" },
  timeout: 10_000,
});

// ─── Simple serial queue (respect rate limits) ───────────────────────────────

type QueuedTask = () => Promise<any>;

class RateLimitedQueue {
  private queue: QueuedTask[] = [];
  private running = false;
  private intervalMs: number;

  constructor(callsPerMinute: number) {
    this.intervalMs = Math.ceil((60 * 1000) / callsPerMinute);
  }

  enqueue<T = any>(task: QueuedTask): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await task());
        } catch (e) {
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, this.intervalMs));
      }
    }
    this.running = false;
  }
}

// api-football.com free: 100/day → ~4/hour → be conservative
const aflQueue = new RateLimitedQueue(20); // 20/min max during bursts
// football-data.io free: 10/min
const fdQueue = new RateLimitedQueue(8);   // 8/min to stay safe

// ─── AFL helpers ─────────────────────────────────────────────────────────────

async function aflGet<T = any>(endpoint: string, params?: Record<string, any>): Promise<T> {
  const cacheKey = `afl:${endpoint}:${JSON.stringify(params ?? {})}`;

  const cached = await cache.get<T>(cacheKey);
  if (cached) return cached;

  return aflQueue.enqueue(async () => {
    const res = await aflClient.get(endpoint, { params });
    const data = res.data?.response;
    return data;
  });
}

async function fdGet<T = any>(endpoint: string, params?: Record<string, any>): Promise<T> {
  const cacheKey = `fd:${endpoint}:${JSON.stringify(params ?? {})}`;

  const cached = await cache.get<T>(cacheKey);
  if (cached) return cached;

  return fdQueue.enqueue(async () => {
    const res = await fdClient.get(endpoint, { params });
    return res.data;
  });
}

// ─── LIVE SCORES (api-football.com) ──────────────────────────────────────────

/**
 * Get all live fixtures for a league.
 * leagueId: 1 = World Cup
 */
export async function getLiveFixtures(leagueId = 1, season = 2026) {
  const cacheKey = `afl:live:${leagueId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await aflQueue.enqueue(async () => {
    const res = await aflClient.get("/fixtures", {
      params: { live: "all", league: leagueId, season },
    });
    return res.data?.response ?? [];
  });

  await cache.set(cacheKey, data, TTL.LIVE_MATCH);
  return data;
}

/**
 * Get single fixture with full events, lineups, stats.
 * This is the main live data call — cached 25s.
 */
export async function getFixtureById(fixtureId: number) {
  const cacheKey = `afl:fixture:${fixtureId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await aflQueue.enqueue(async () => {
    const res = await aflClient.get("/fixtures", {
      params: { id: fixtureId },
    });
    return res.data?.response?.[0] ?? null;
  });

  if (data) {
    const isLive = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(
      data.fixture?.status?.short
    );
    await cache.set(cacheKey, data, isLive ? TTL.LIVE_MATCH : TTL.MATCH_DETAIL);
  }
  return data;
}

/**
 * Get fixture events (goals, cards, subs).
 */
export async function getFixtureEvents(fixtureId: number) {
  const cacheKey = `afl:events:${fixtureId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await aflQueue.enqueue(async () => {
    const res = await aflClient.get("/fixtures/events", {
      params: { fixture: fixtureId },
    });
    return res.data?.response ?? [];
  });

  await cache.set(cacheKey, data, TTL.LIVE_MATCH);
  return data;
}

/**
 * Get fixture lineups.
 */
export async function getFixtureLineups(fixtureId: number) {
  const cacheKey = `afl:lineups:${fixtureId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await aflQueue.enqueue(async () => {
    const res = await aflClient.get("/fixtures/lineups", {
      params: { fixture: fixtureId },
    });
    return res.data?.response ?? [];
  });

  await cache.set(cacheKey, data, 120); // 2 min — lineup rarely changes
  return data;
}

/**
 * Get fixture statistics (possession, shots, etc.)
 */
export async function getFixtureStats(fixtureId: number) {
  const cacheKey = `afl:stats:${fixtureId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await aflQueue.enqueue(async () => {
    const res = await aflClient.get("/fixtures/statistics", {
      params: { fixture: fixtureId },
    });
    return res.data?.response ?? [];
  });

  await cache.set(cacheKey, data, TTL.LIVE_MATCH);
  return data;
}

/**
 * Get all fixtures for a league+season (for seeding/sync).
 */
export async function getAllFixtures(leagueId = 1, season = 2026) {
  const cacheKey = `afl:fixtures:${leagueId}:${season}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await aflQueue.enqueue(async () => {
    const res = await aflClient.get("/fixtures", {
      params: { league: leagueId, season },
    });
    return res.data?.response ?? [];
  });

  await cache.set(cacheKey, data, TTL.TODAY_MATCHES);
  return data;
}

/**
 * Get today's fixtures for a league.
 */
export async function getTodayFixtures(leagueId = 1, season = 2026) {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `afl:today:${leagueId}:${today}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await aflQueue.enqueue(async () => {
    const res = await aflClient.get("/fixtures", {
      params: { league: leagueId, season, date: today },
    });
    return res.data?.response ?? [];
  });

  await cache.set(cacheKey, data, TTL.TODAY_MATCHES);
  return data;
}

// ─── STATIC DATA (football-data.io) ──────────────────────────────────────────

export async function getCompetition(code = "WC") {
  const cacheKey = `fd:competition:${code}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await fdGet(`/competitions/${code}`);
  await cache.set(cacheKey, data, TTL.COMPETITION);
  return data;
}

export async function getStandings(competitionCode = "WC") {
  const cacheKey = `fd:standings:${competitionCode}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await fdGet(`/competitions/${competitionCode}/standings`);
  await cache.set(cacheKey, data, TTL.STANDINGS);
  return data;
}

export async function getCompetitionTeams(competitionCode = "WC") {
  const cacheKey = `fd:teams:${competitionCode}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await fdGet(`/competitions/${competitionCode}/teams`);
  await cache.set(cacheKey, data, TTL.COMPETITION);
  return data;
}

export async function getTeamSquad(teamId: number) {
  const cacheKey = `fd:squad:${teamId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await fdGet(`/teams/${teamId}`);
  await cache.set(cacheKey, data, TTL.PLAYER_LIST);
  return data;
}

export async function getTopScorers(competitionCode = "WC") {
  const cacheKey = `fd:scorers:${competitionCode}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await fdGet(`/competitions/${competitionCode}/scorers?limit=20`);
  await cache.set(cacheKey, data, TTL.PLAYER_STATS);
  return data;
}
