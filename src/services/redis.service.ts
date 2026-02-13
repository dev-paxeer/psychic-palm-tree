import { createClient, type RedisClientType } from 'redis';
import { config } from '../config.js';

let _client: RedisClientType | null = null;
let _connecting = false;

export async function getRedis(): Promise<RedisClientType> {
  if (_client?.isOpen) return _client;

  if (_connecting) {
    // Wait for ongoing connection attempt
    await new Promise(r => setTimeout(r, 500));
    if (_client?.isOpen) return _client;
    throw new Error('Redis connection in progress');
  }

  _connecting = true;
  try {
    if (!config.redisUrl) {
      throw new Error('REDIS_URL is not set');
    }

    // Clean up old client
    if (_client) {
      try { await _client.disconnect(); } catch {}
      _client = null;
    }

    _client = createClient({
      url: config.redisUrl,
      socket: {
        connectTimeout: 10_000,
        keepAlive: 30_000,
        reconnectStrategy: (retries: number) => {
          if (retries > 10) return new Error('Redis max retries reached');
          return Math.min(retries * 500, 5_000);
        },
      },
    });

    _client.on('error', (err) => {
      // Only log once per minute to avoid spam
      const now = Date.now();
      if (now - _lastErrorLog > 60_000) {
        console.error('Redis error:', err.message);
        _lastErrorLog = now;
      }
    });
    _client.on('reconnecting', () => console.log('Redis reconnecting...'));
    _client.on('ready', () => console.log('✓ Redis ready'));

    await _client.connect();
    console.log('✓ Redis connected');
    return _client;
  } finally {
    _connecting = false;
  }
}

let _lastErrorLog = 0;

export async function closeRedis() {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}

/**
 * Redis-backed rate limiter.
 * Returns { allowed, remaining, resetAt } for the given key.
 */
export async function checkRateLimit(key: string, windowSec: number, maxRequests: number) {
  const redis = await getRedis();
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `rl:${key}:${Math.floor(now / windowSec)}`;

  const count = await redis.incr(windowKey);
  if (count === 1) {
    await redis.expire(windowKey, windowSec);
  }

  const ttl = await redis.ttl(windowKey);
  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
    resetAt: now + (ttl > 0 ? ttl : windowSec),
    count,
  };
}

/**
 * Simple cache get/set with TTL.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedis();
  const data = await redis.get(`cache:${key}`);
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  const redis = await getRedis();
  await redis.setEx(`cache:${key}`, ttlSec, JSON.stringify(value));
}
