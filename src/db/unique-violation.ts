/**
 * True when Postgres refused a write because it would break this unique index (code 23505). A check-then-write can
 * lose a race to a write in between; the index is what decides, and this lets the store answer in its own words.
 * Drizzle wraps the driver's error, so the code and the index's name are looked for on the error and on its cause.
 */
export function isUniqueViolation(e: unknown, index: string): boolean {
  for (let err: unknown = e, depth = 0; err && typeof err === "object" && depth < 3; err = (err as { cause?: unknown }).cause, depth++) {
    const { code, constraint } = err as { code?: unknown; constraint?: unknown };
    if (code === "23505" && constraint === index) return true;
  }
  return false;
}
