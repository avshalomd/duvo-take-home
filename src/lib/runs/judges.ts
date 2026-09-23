import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import type { Judge } from "./verdict-words";

/**
 * The names of the people who judged, by user id, for "Mia said it looks right": the account's name, or its email
 * when it has none. Ids with no account left are absent, so their judgment reads neutrally. The ids come from runs
 * of the viewer's own workspace, so only colleagues' names are ever read.
 */
export async function judgeNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return {};
  const rows = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, wanted));
  return Object.fromEntries(rows.map((r) => [r.id, r.name.trim() || r.email]));
}

/** The judge of one run as verdictWords() takes it. */
export function judgeOf(id: string | null | undefined, names: Record<string, string>): Judge {
  return id ? { id, name: names[id] ?? null } : null;
}
