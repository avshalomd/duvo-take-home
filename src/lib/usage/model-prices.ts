/**
 * What one model call cost, from the tokens it read and wrote. Used for the calls outside a run (Check again, Make an
 * automation), whose cost no SDK reports (QA F18): the agent's own runs keep the SDK's figure.
 */
export type ModelUsage = { modelId: string; inputTokens: number; outputTokens: number };

type Price = { inputPerMillion: number; outputPerMillion: number };

// Matched by name inside the id, so "anthropic/claude-sonnet-5" on the gateway is the same model. List prices in USD.
const PRICES: { name: string; price: Price }[] = [
  { name: "claude-sonnet-5", price: { inputPerMillion: 2, outputPerMillion: 10 } }, // Anthropic's list price
  // Jev has no list price in this repo: $1 per million tokens read is a guess on the high side (the whole QA hour on
  // it cost cents). It writes no text, so it has no output price. Replace it here when the price is known.
  { name: "jev", price: { inputPerMillion: 1, outputPerMillion: 0 } },
];

// A model with no price here (the OpenRouter fallback, an AI_MODEL override) is counted at Claude Sonnet 4.6's list
// price, the dearest the reviewer or the drafter runs on: the day's spend may read a little high, never low.
const UNKNOWN: Price = { inputPerMillion: 3, outputPerMillion: 15 };

export function costOfCall(usage: ModelUsage): number {
  const price = PRICES.find((p) => usage.modelId.includes(p.name))?.price ?? UNKNOWN;
  return (usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion) / 1_000_000;
}
