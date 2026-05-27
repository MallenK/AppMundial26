import rateLimit from "express-rate-limit";

/** General API rate limit: 120 requests per minute per IP */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in a minute." },
});

/** Strict limit for auth endpoints: 10 per minute per IP */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth requests." },
});

/** Comment posting: 30 per hour per IP */
export const commentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Comment rate limit reached. Try again in an hour." },
});

/** Photo upload: 5 per match per hour (enforced in route handler, not here) */
export const photoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Photo upload rate limit reached." },
});

/** Prediction submit: 1 per match — enforced by DB UNIQUE constraint */
export const predictionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many prediction requests." },
});
