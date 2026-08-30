// Best-effort in-memory rate limiter for the login endpoint, keyed by IP.
// This is a defense-in-depth layer only: on serverless hosts each instance
// has its own memory, so it does not guarantee a global limit across
// instances. The durable defense against brute-forcing the 6 known school
// accounts is the per-account lockout in lib/auth.ts, which is backed by
// the database and therefore consistent across every instance.

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 20;

const buckets = new Map<string, Bucket>();

// Periodically forget old buckets so this map can't grow without bound.
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function isIpRateLimited(ip: string): boolean {
  const now = Date.now();
  if (buckets.size > 5000) sweep(now);

  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > MAX_ATTEMPTS_PER_WINDOW;
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
