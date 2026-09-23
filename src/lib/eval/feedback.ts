import type { FeedbackForAgent, IsHealable } from "@/contracts/eval";

/** The verdict as instructions for the agent: what failed, and what to change. */
export const feedbackForAgent: FeedbackForAgent = (verdict) => verdict.reasons.join("\n"); // STUB: the eval package

/** A failing verdict the agent can fix by working again. */
export const isHealable: IsHealable = () => false; // STUB: the eval package (false keeps auto-heal off until it lands)
