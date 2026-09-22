import { rm } from "node:fs/promises";

/**
 * Delete a run's working directory once its files are in the database. On Vercel the directory lives under the
 * function's temp dir, which is kept between invocations: without this it grows until writes start failing.
 * It never throws - a cleanup failure must not replace the run's own error.
 */
export async function removeRunDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
