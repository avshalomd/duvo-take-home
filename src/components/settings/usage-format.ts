// Today's usage in words and meters, for the Limits page.

/** Dollars with cents; a spend under a cent says so, because "$0.00" would read as nothing spent. */
export function usd(amount: number): string {
  if (amount > 0 && amount < 0.01) return "under $0.01";
  return `$${amount.toFixed(2)}`;
}

/** "in 5 hours 12 minutes": the time left until the limits reset, counted from `now` (passed in, so it is testable). */
export function resetsIn(resetsAt: string, now: Date): string {
  const minutes = Math.floor((Date.parse(resetsAt) - now.getTime()) / 60_000);
  if (minutes < 1) return "in under a minute";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `in ${[hours ? plural(hours, "hour") : "", rest ? plural(rest, "minute") : ""].filter(Boolean).join(" ")}`;
}

/** How full a meter is. Full only when the limit is reached, so 199 of 200 never rounds up to a full bar. */
export function meterFill(used: number, limit: number): { percent: number; tone: "ok" | "warn" | "full" } {
  if (limit <= 0 || used >= limit) return { percent: 100, tone: "full" };
  const percent = Math.floor((used / limit) * 100 + 1e-9); // 24/30*100 is 79.999...: the epsilon keeps it at the 80 it is
  return { percent, tone: percent >= 80 ? "warn" : "ok" };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
