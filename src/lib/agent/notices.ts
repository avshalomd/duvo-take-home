// The SDK messages that say something went wrong with the model rather than with a tool: a refused turn, a failed
// reply, a retry, a denied call. Each becomes one plain sentence for the timeline (QA Q128: a refused run used to
// show empty turns). Pure: the mapper decides where the sentence goes.

export type Notice = { text: string; notice: "refusal" | "api_error" | "api_retry" | "denied" };

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

// SDKAssistantMessageError codes in words a person can act on; anything new falls back to the code itself.
const API_ERRORS: Record<string, string> = {
  rate_limit: "too many requests",
  overloaded: "it is overloaded",
  server_error: "a server error at the model provider",
  billing_error: "a billing problem with the model account",
  authentication_failed: "the model key was refused",
  invalid_request: "the request was not accepted",
  model_not_found: "the model was not found",
  max_output_tokens: "the reply was too long and was cut off",
};
export const apiErrorWords = (code: string) => API_ERRORS[code] ?? (code ? code.replaceAll("_", " ") : "an unknown error");

const flagged = (category: unknown) => (str(category) ? ` (flagged as ${str(category)})` : "");

/** A turn the model itself refused: stop_reason "refusal" on the assistant message. */
export function refusalNotice(message: Rec): Notice | null {
  if (message.stop_reason !== "refusal") return null;
  const details = rec(message.stop_details);
  const explanation = str(details.explanation).trim().replace(/\.+$/, ""); // the sentence gets its own full stop
  const why = explanation ? `: ${explanation}` : "";
  return { notice: "refusal", text: `The model declined to continue this step${flagged(details.category)}${why}.` };
}

/** A failed reply the SDK marks with `error` on the assistant message. */
export function apiErrorNotice(code: unknown): Notice | null {
  if (!str(code)) return null;
  return { notice: "api_error", text: `The model's reply failed: ${apiErrorWords(str(code))}.` };
}

/** The system messages worth a line in the timeline; null for the rest (status, summaries and friends are noise). */
export function systemNotice(m: Rec): Notice | null {
  switch (m.subtype) {
    case "model_refusal_fallback":
      return { notice: "refusal", text: `The model declined a step${flagged(m.api_refusal_category)}; it was tried again on ${str(m.fallback_model) || "another model"}.` };
    case "model_refusal_no_fallback":
      return { notice: "refusal", text: `The model declined a step${flagged(m.api_refusal_category)}, and no other model could try it.` };
    case "api_retry": {
      const status = typeof m.error_status === "number" ? `, HTTP ${m.error_status}` : "";
      return { notice: "api_retry", text: `The model did not answer (${apiErrorWords(str(m.error))}${status}); trying again (${m.attempt} of ${m.max_retries}).` };
    }
    case "permission_denied": {
      const why = str(m.decision_reason_type) ? ` (${str(m.decision_reason_type)})` : "";
      return { notice: "denied", text: `The ${str(m.tool_name) || "tool"} call was blocked before it ran${why}.` };
    }
    default:
      return null;
  }
}
