import type { z } from "zod";

// A NUL character (U+0000) is invisible and never typed, but a paste or a script can carry one, and Postgres refuses
// it in any text column: it surfaced as an empty 500 or "Something went wrong" (QA F1). Every text the app stores is
// checked at its boundary with this one rule.
export const NUL_REFUSED = "This text has a hidden character that cannot be saved. Type it again, or paste it as plain text.";

export const hasNoNul = (text: string) => !text.includes("\u0000");

/** The schema, refusing a NUL character in plain words. Zod 4 keeps the type, so .trim().min() still chain after it. */
export function noNul<T extends z.ZodString>(schema: T): T {
  return schema.refine(hasNoNul, NUL_REFUSED) as T;
}
