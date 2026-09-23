import { ZodError } from "zod";
import { LlmError } from "@/lib/llm/errors";

// What a failed Server Action is allowed to say to the browser. It lives beside the actions rather than inside
// them because a "use server" file may only export async functions - and this one is worth testing on its own.
//
// Only errors written for a person are forwarded: a model failure and a validation message. Everything else - a
// Postgres error naming the host and the user, an SDK stack - is logged for us and answered with one sentence.
export function readable(e: unknown): string {
  if (e instanceof LlmError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? FALLBACK;
  console.error("action failed", e);
  return FALLBACK;
}

const FALLBACK = "Something went wrong on our side - try again";
