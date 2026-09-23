/**
 * A sliding-window token bucket in memory: the start times of the last `windowMs` per key, capped at `limit`.
 * In memory, so it is per server instance and resets on a deploy - enough to stop one visitor spending the
 * budget in a minute, not a substitute for the auth on the roadmap (QA Q48).
 */
export type Bucket = {
  take(key: string, now: number): boolean;
  /** Milliseconds until the key may take again: 0 now, else when its oldest start leaves the window (Q206). */
  retryAfter(key: string, now: number): number;
  size(now: number): number;
};

export function tokenBucket(limit: number, windowMs: number): Bucket {
  const seen = new Map<string, number[]>();

  // Drop every start older than the window, everywhere: without this the map grows once per address, for ever.
  const prune = (now: number) => {
    for (const [key, times] of seen) {
      const live = times.filter((t) => now - t < windowMs);
      if (live.length) seen.set(key, live);
      else seen.delete(key);
    }
  };

  return {
    take(key, now) {
      prune(now);
      const times = seen.get(key) ?? [];
      if (times.length >= limit) return false;
      seen.set(key, [...times, now]);
      return true;
    },
    retryAfter(key, now) {
      prune(now);
      const times = seen.get(key) ?? [];
      return times.length < limit ? 0 : times[0] + windowMs - now; // times are in the order taken: the first leaves first
    },
    size(now) {
      prune(now);
      return seen.size;
    },
  };
}
