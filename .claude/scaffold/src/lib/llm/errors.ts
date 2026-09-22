import { APICallError, NoObjectGeneratedError, RetryError, type LanguageModel } from "ai";

// One error type for every LLM failure, with a message written for the user: the UI shows it as it is and offers
// a retry. `kind` lets the caller decide what else to do; the original error is kept as `cause` for the logs.
export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "off-schema" | "unavailable",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "LlmError";
  }
}

export function toLlmError(e: unknown, timeoutMs: number): LlmError {
  if (e instanceof LlmError) return e;
  if (isTimeout(e)) return new LlmError(`The model took too long (${timeoutMs / 1000} s). Retry.`, "timeout", { cause: e });
  if (NoObjectGeneratedError.isInstance(e)) {
    return new LlmError("The model's answer did not fit the expected format. Retry.", "off-schema", { cause: e });
  }
  const detail = providerReason(e) ?? (e instanceof Error ? e.message : String(e));
  return new LlmError(`The model call failed: ${detail}`, "unavailable", { cause: e });
}

// A gateway says "Provider returned error" and puts the reason a human needs - rate limited, parameter not
// supported, model retired - inside the body (OpenRouter: error.metadata.raw). Surfacing it turns an unreadable
// failure into a fixable one; summarising it away cost a morning of blaming models for a 429 (2026-09-20).
function providerReason(e: unknown): string | undefined {
  const err = RetryError.isInstance(e) ? e.lastError : e; // a retried call wraps the real error, reason and all
  if (!APICallError.isInstance(err) || typeof err.responseBody !== "string") return undefined;
  try {
    const body = JSON.parse(err.responseBody)?.error;
    const raw = typeof body?.metadata?.raw === "string" ? body.metadata.raw : body?.message;
    return typeof raw === "string" ? raw.replace(/\s+/g, " ").slice(0, 300) : undefined;
  } catch {
    return undefined;
  }
}

function isTimeout(e: unknown): boolean {
  // The SDK aborts with a DOMException named TimeoutError; a retried call wraps the last error in a RetryError.
  const err = RetryError.isInstance(e) ? e.lastError : e;
  const name = typeof err === "object" && err !== null && "name" in err ? err.name : undefined;
  return name === "TimeoutError" || name === "AbortError";
}

export function modelIdOf(m: LanguageModel): string {
  return typeof m === "string" ? m : m.modelId;
}
