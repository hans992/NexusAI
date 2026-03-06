import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitResult = { success: boolean; limit: number; remaining: number; reset: number };

const inMemory = new Map<string, { count: number; reset: number }>();

function nowMs() {
  return Date.now();
}

export async function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    const redis = Redis.fromEnv();
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(opts.limit, `${Math.max(1, Math.floor(opts.windowMs / 1000))} s`),
      analytics: true,
    });
    const result = await limiter.limit(key);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  }

  // Dev fallback: simple fixed window
  const t = nowMs();
  const entry = inMemory.get(key);
  if (!entry || entry.reset <= t) {
    const reset = t + opts.windowMs;
    inMemory.set(key, { count: 1, reset });
    return { success: true, limit: opts.limit, remaining: opts.limit - 1, reset };
  }

  entry.count += 1;
  inMemory.set(key, entry);
  const remaining = Math.max(0, opts.limit - entry.count);
  return { success: entry.count <= opts.limit, limit: opts.limit, remaining, reset: entry.reset };
}

