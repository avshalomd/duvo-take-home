/** Not implemented yet: the tests in rate-limit.test.ts come first. */
export type Bucket = { take(key: string, now: number): boolean; size(now: number): number };

export function tokenBucket(limit: number, windowMs: number): Bucket {
  void limit;
  void windowMs;
  return { take: () => true, size: () => 1 };
}
