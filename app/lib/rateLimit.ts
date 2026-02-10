type Bucket = {
  count: number
  resetAt: number
}

const globalForRateLimit = globalThis as unknown as {
  __leeshRateLimitBuckets?: Map<string, Bucket>
}

const buckets =
  globalForRateLimit.__leeshRateLimitBuckets ??
  new Map<string, Bucket>()

if (!globalForRateLimit.__leeshRateLimitBuckets) {
  globalForRateLimit.__leeshRateLimitBuckets = buckets
}

function cleanupExpired(now: number) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  return 'unknown'
}

export function takeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): {
  ok: boolean
  retryAfterSec: number
  remaining: number
} {
  const now = Date.now()
  cleanupExpired(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return {
      ok: true,
      retryAfterSec: 0,
      remaining: Math.max(0, limit - 1),
    }
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      remaining: 0,
    }
  }

  bucket.count += 1
  return {
    ok: true,
    retryAfterSec: 0,
    remaining: Math.max(0, limit - bucket.count),
  }
}
