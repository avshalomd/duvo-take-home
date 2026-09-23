import { createHmac, timingSafeEqual } from "node:crypto";

// The token that lets a request start one run at /api/runner/<id>. It is derived from the deployment's sign-in
// secret with its own label, so no new secret has to be set, and it is bound to the run id, so a token seen once
// cannot start any other run. The run's own claim (queued -> running) makes a replayed token start nothing.
const key = () => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set: the runner's token cannot be made");
  return secret;
};

export const runnerToken = (runId: string): string => createHmac("sha256", key()).update(`runner:${runId}`).digest("hex");

export function verifyRunnerToken(runId: string, token: string | null): boolean {
  if (!token || !process.env.BETTER_AUTH_SECRET) return false;
  const expected = Buffer.from(runnerToken(runId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected); // equal length first: timingSafeEqual throws otherwise
}
