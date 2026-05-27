/**
 * Cache service using @upstash/redis (HTTP REST API).
 * Uses UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from .env.
 * No persistent TCP connection needed — works on any hosting.
 */
import { Redis } from "@upstash/redis";

let client: Redis | null = null;

function getClient(): Redis {
  if (!client) {
    client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL ?? "",
      token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
    });
    console.log("[Redis] Upstash REST client initialized");
  }
  return client;
}

export const cache = {
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const val = await getClient().get<T>(key);
      return val ?? null;
    } catch {
      return null; // graceful degradation — cache miss
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await getClient().set(key, value, { ex: ttlSeconds });
    } catch (err: any) {
      console.warn("[Redis] Set error:", err.message);
    }
  },

  async del(key: string): Promise<void> {
    try {
      await getClient().del(key);
    } catch (err: any) {
      console.warn("[Redis] Del error:", err.message);
    }
  },

  async delPattern(pattern: string): Promise<void> {
    try {
      // Upstash REST supports SCAN — scan + delete matching keys
      const keys = await getClient().keys(pattern);
      if (keys.length > 0) {
        await getClient().del(...keys);
      }
    } catch (err: any) {
      console.warn("[Redis] DelPattern error:", err.message);
    }
  },
};

// TTL constants (seconds)
export const TTL = {
  LIVE_MATCH: 25,       // live score — expires before next poll
  TODAY_MATCHES: 60,    // today's fixture list
  MATCH_DETAIL: 30,     // individual match with events
  STANDINGS: 300,       // group standings — 5 min
  PLAYER_STATS: 3600,   // 1 hour
  PLAYER_LIST: 1800,    // 30 min
  RANKING_GLOBAL: 300,  // 5 min
  RANKING_FRIENDS: 120, // 2 min
  COMMENTS_PAGE1: 30,   // first page comments
  COMPETITION: 86400,   // competitions list — 1 day
};
