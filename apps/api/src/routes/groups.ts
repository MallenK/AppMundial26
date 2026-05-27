import { Router, Request, Response } from "express";
import { withCache } from "../middleware/cache";
import { getStandings } from "../services/footballApi";
import { TTL } from "../services/cacheService";

const router = Router();

// ─── GET /groups/standings — World Cup group standings ────────────────────────
router.get("/standings", withCache(TTL.STANDINGS), async (_req: Request, res: Response) => {
  try {
    const data = await getStandings("WC");
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
