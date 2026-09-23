import type { GuardContext } from "@/contracts/guard";
import type { Plan } from "@/contracts/run";
import { LlmError } from "@/lib/llm/errors";
import { hostReach, isPrivateHost, type Reach } from "@/lib/net/address";
import { carriedIn, type Carrier } from "./carried";
import { askJev, JEV_TIMEOUT_MS, type AskExfiltration, type ExfiltrationState } from "./exfiltration";
import { allowed, type Verdict } from "./verdict";

/**
 * The url guard, on every WebFetch. Code first: an address that is not a public web page, and a host on the
 * workspace's deny list, are blocked outright. Then, only for an address with room to carry data out - a long query
 * string, an encoded path, an encoded subdomain (carried.ts) - one question to Jev. Jev being down or slow must not
 * stop the run, so that case is let through and recorded as "unchecked".
 */

// What the agent should do instead, by where the data rode: the denial reason is the only thing it reads.
const INSTEAD: Record<Carrier, string> = {
  query: "Fetch the page without the added query text.",
  path: "Fetch the page without the added text in its path.",
  host: "Fetch the site's own address, without the added text in front of its name.",
};

export const BLOCK_AT = 0.8;
export const FLAG_AT = 0.5;
const PLAN_LINES = 5; // the first steps say what the task is; the whole plan would only dilute the question

// One rule with the connection form (lib/net/address.ts): a connection and a fetch must not reach our own network.
export { isPrivateHost };

export function isDeniedHost(hostname: string, denied: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, ""); // "example.com." is the same host as "example.com"
  return denied.some((entry) => {
    const domain = entry.trim().toLowerCase().replace(/^\*?\./, ""); // "*.evil.example" and ".evil.example" mean the domain
    return domain !== "" && (host === domain || host.endsWith(`.${domain}`)); // the dot: notevil.example is another site
  });
}

/** What Jev reads: the address, and the task as the agent understood it (the task text itself is not in the context). */
export function exfiltrationState(url: string, plan: Plan | null): ExfiltrationState {
  return { url, task: plan?.intent || "(no plan yet)", plan: plan?.steps.slice(0, PLAN_LINES).map((s) => s.title) ?? [] };
}

class TooSlow extends Error {}

/** The whole question inside one deadline: decide() times out per route, and fails over to the next one. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TooSlow()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const slow = (e: unknown) => e instanceof TooSlow || (e instanceof LlmError && e.kind === "timeout");

export function urlCheck(
  ctx: Pick<GuardContext, "deniedDomains" | "plan">,
  ask: AskExfiltration = askJev,
  timeoutMs = JEV_TIMEOUT_MS,
  reach: Reach = hostReach,
) {
  return async (_tool: string, input: unknown): Promise<Verdict> => {
    const raw = (input as { url?: unknown } | null)?.url;
    if (typeof raw !== "string") return allowed("no address"); // WebFetch refuses the call itself
    let url: URL;
    try {
      url = new URL(raw); // also normalises tricks such as http://2130706433/ into http://127.0.0.1/
    } catch {
      return allowed("not an address the tool can fetch");
    }
    const host = url.hostname;

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { decision: "blocked", reason: `Only web pages (http or https) can be fetched, not ${url.protocol} addresses.`, target: raw };
    }
    if (isPrivateHost(host)) {
      return { decision: "blocked", reason: `${host} is a private or local address. Only public web pages can be fetched.`, target: host };
    }
    if (isDeniedHost(host, ctx.deniedDomains)) {
      return { decision: "blocked", reason: `${host} is blocked in this workspace's settings. Use another source.`, target: host };
    }
    // A public-looking name can resolve inside our network (security QA): look it up before the fetch does.
    const verdict = await reach(host);
    if (verdict.reach === "internal") {
      return { decision: "blocked", reason: `${host} leads to a private or local address. Only public web pages can be fetched.`, target: host };
    }
    if (verdict.reach === "unknown") {
      return { decision: "blocked", reason: `The address of ${host} could not be found, so it was not fetched. Check the address or use another source.`, target: host };
    }

    const carrier = carriedIn(url);
    if (!carrier) return allowed("an ordinary address"); // no room for the task's data: no question, no cost

    let p: number;
    try {
      p = await within(ask(exfiltrationState(raw, ctx.plan())), timeoutMs);
    } catch (e) {
      const why = slow(e) ? "in time" : "because the checking service was unavailable";
      return { decision: "unchecked", reason: `This address could not be checked ${why}, so the fetch went ahead.`, target: host };
    }
    if (p >= BLOCK_AT) {
      return {
        decision: "blocked",
        reason: `This address looks like it carries the task's data to another site. ${INSTEAD[carrier]}`,
        target: host,
      };
    }
    if (p >= FLAG_AT) {
      return { decision: "flagged", reason: "This address may carry the task's data to another site; the fetch went ahead.", target: host };
    }
    return allowed("an ordinary address");
  };
}
