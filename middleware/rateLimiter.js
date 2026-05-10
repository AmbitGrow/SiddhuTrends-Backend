import rateLimit from "express-rate-limit";

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later"
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Auth rate limiter (stricter)
 * 5 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    message: "Too many login/signup attempts, please try again after 15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

/**
 * Payment rate limiter
 * 10 requests per 15 minutes per IP
 */
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    message: "Too many payment requests, please try again later"
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Webhook rate limiter (more lenient for gateway callbacks)
 * 50 requests per minute
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50,
  message: {
    success: false,
    message: "Webhook rate limit exceeded"
  },
  standardHeaders: false,
  legacyHeaders: false
});
