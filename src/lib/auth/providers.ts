import "server-only";

/** Google sign-in is offered only when both of its keys are set; without them the button is not shown at all. */
export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
