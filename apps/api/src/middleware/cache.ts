import { Request, Response, NextFunction } from "express";
import { cache } from "../services/cacheService";

/**
 * Express cache middleware.
 * Caches the JSON response body in Redis for `ttl` seconds.
 * Cache key = request URL (path + query string).
 * Sets X-Cache: HIT / MISS header.
 */
export function withCache(ttl: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `api:${req.originalUrl}`;

    const cached = await cache.get(key);
    if (cached !== null) {
      res.setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }

    // Intercept res.json to capture and cache the response
    const originalJson = res.json.bind(res);
    (res as any).json = async (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await cache.set(key, body, ttl);
      }
      res.setHeader("X-Cache", "MISS");
      return originalJson(body);
    };

    next();
  };
}
