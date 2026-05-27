import { createClient, RedisClientType } from "redis";

let client: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!client) {
    client = createClient({ url: process.env.UPSTASH_REDIS_URL }) as RedisClientType;
    client.on("error", (err: Error) => {
      console.error("[Redis] Client error:", err.message);
    });
    await client.connect();
    console.log("[Redis] Connected to Upstash");
  }
  return client;
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = await getRedisClient();
      const val = await redis.get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch {
      return null; // cache miss on error — graceful degradation
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      const redis = await getRedisClient();
      await redis.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (err: any) {
      console.warn("[Redis] Set error:", err.message);
    }
  },

  async del(key: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      await redis.del(key);
    } catch (err: any) {
      console.warn("[Redis] Del error:", err.message);
    }
  },

  async delPattern(pattern: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } catch (err: any) {
      console.warn("[Redis] DelPattern error:", err.message);
    }
  },

  /** Pub/sub publisher for socket.io adapter */
  async publish(channel: string, message: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      await redis.publish(channel, message);
    } catch (err: any) {
      console.warn("[Redis] Publish error:", err.message);
    }
  },
};

// TTL constants (seconds)
export const TTL = {
  LIVE_MATCH: 25,          // live score — expires before next poll
  TODAY_MATCHES: 60,        // today's fixture list
  MATCH_DETAIL: 30,         // individual match with events
  STANDINGS: 300,           // group standings — 5 min
  PLAYER_STATS: 3600,       // 1 hour
  PLAYER_LIST: 1800,        // 30 min
  RANKING_GLOBAL: 300,      // 5 min
  RANKING_FRIENDS: 120,     // 2 min
  COMMENTS_PAGE1: 30,       // first page comments
  COMPETITION: 86400,       // competitions list — 1 day
};
