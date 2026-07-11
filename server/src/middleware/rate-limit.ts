import { Context, Next } from 'hono';
import { getErrorMessage } from '../i18n/errors.zh-CN';
import logger from '../i18n/logger';

const store = new Map<string, { count: number; resetAt: number }>();

// 定期清理过期条目
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, 60_000);

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (c: Context) => string;
}

export function rateLimiter(options: RateLimitOptions) {
  const { windowMs, max, keyGenerator } = options;

  return async (c: Context, next: Next) => {
    const key = keyGenerator
      ? keyGenerator(c)
      : c.req.header('x-forwarded-for') ||
        c.req.header('x-real-ip') ||
        'unknown';

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count++;

    if (entry.count > max) {
      logger.warn({ key, count: entry.count }, '速率限制触发');
      return c.json({
        error: {
          code: 'RATE_LIMITED',
          message: getErrorMessage('RATE_LIMITED')
        }
      }, 429);
    }

    return next();
  };
}