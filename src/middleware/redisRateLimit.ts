import type { Context, Next } from 'hono';
import { checkRateLimit } from '../services/redis.service.js';

/**
 * Redis-backed rate limiter middleware for Hono.
 */
export function redisRateLimit(opts: {
  windowSec: number;
  max: number;
  keyFn?: (c: Context) => string;
}) {
  const { windowSec, max, keyFn } = opts;

  return async (c: Context, next: Next) => {
    const key = keyFn ? keyFn(c) : getClientIp(c);

    try {
      const result = await checkRateLimit(key, windowSec, max);

      c.header('X-RateLimit-Limit', max.toString());
      c.header('X-RateLimit-Remaining', result.remaining.toString());
      c.header('X-RateLimit-Reset', result.resetAt.toString());

      if (!result.allowed) {
        return c.json(
          { error: 'Too many requests', retryAfter: windowSec },
          429
        );
      }
    } catch (err) {
      // If Redis is down, fall through (fail open)
      console.warn('Rate limit check failed, allowing request:', err);
    }

    return next();
  };
}

function getClientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown'
  );
}
