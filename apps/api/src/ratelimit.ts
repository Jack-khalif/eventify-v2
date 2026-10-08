/**
 * Counts requests per key in fixed windows, in this process's memory. Enough while the API runs as
 * one instance; with several, each would keep its own count and the limits would need a shared store.
 */
export type RateLimiter = (key: string, max: number, windowMs: number) => boolean;

const SWEEP_ABOVE = 10_000;

/** Returns a function that says whether this request is still within its limit. */
export function createRateLimiter(now: () => number): RateLimiter {
  const windows = new Map<string, { count: number; endsAt: number }>();
  return (key, max, windowMs) => {
    const at = now();
    if (windows.size > SWEEP_ABOVE) {
      for (const [k, w] of windows) if (w.endsAt <= at) windows.delete(k);
    }
    const current = windows.get(key);
    if (!current || current.endsAt <= at) {
      windows.set(key, { count: 1, endsAt: at + windowMs });
      return true;
    }
    current.count += 1;
    return current.count <= max;
  };
}
