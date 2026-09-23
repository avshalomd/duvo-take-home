import { WorkspaceLimits } from "@/contracts/usage";

// Beside the actions rather than inside them: a "use server" file may only export async functions, and the parse is
// worth testing on its own.

export type LimitsFormResult =
  | { ok: true; limits: WorkspaceLimits }
  | { ok: false; fieldErrors: Record<string, string[] | undefined>; values: Record<string, string> };

// The contract's messages are Zod's defaults ("expected number, received NaN"); a form asks for a fix in a sentence.
const SENTENCE: Record<string, string> = {
  dailyBudgetUsd: "Give an amount in dollars between 0 and 1000, for example 5.",
  dailyRunLimit: "Give a whole number of runs between 1 and 1000.",
  maxInFlight: "Give a whole number between 1 and 10.",
  deniedDomains: "Keep the list to 100 websites or fewer.",
};

// A website name: labels of letters, digits and hyphens, joined by dots, ending in a top-level domain.
const HOST = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** The Limits form, as posted, into WorkspaceLimits, or into field errors with the values as they were typed. */
export function parseLimitsForm(form: FormData): LimitsFormResult {
  const text = (name: string) => String(form.get(name) ?? "");
  const values = {
    dailyBudgetUsd: text("dailyBudgetUsd"),
    dailyRunLimit: text("dailyRunLimit"),
    maxInFlight: text("maxInFlight"),
    stepChecks: form.get("stepChecks") === "on" ? "on" : "", // a switch that is off posts nothing, like a checkbox
    strictConnections: form.get("strictConnections") === "on" ? "on" : "",
    deniedDomains: text("deniedDomains"),
    autoHealAttempts: text("autoHealAttempts"),
  };

  const fieldErrors: Record<string, string[]> = {};
  const hosts: string[] = [];
  for (const line of values.deniedDomains.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const host = toHost(line);
    if (!host) {
      fieldErrors.deniedDomains = [`"${line}" is not a website. Write one per line, like example.com.`];
      break;
    }
    if (!hosts.includes(host)) hosts.push(host);
  }

  const parsed = WorkspaceLimits.safeParse({
    dailyBudgetUsd: blankAsMissing(values.dailyBudgetUsd), // Number("") is 0, and a $0 budget would stop every run
    dailyRunLimit: blankAsMissing(values.dailyRunLimit),
    maxInFlight: blankAsMissing(values.maxInFlight),
    stepChecks: values.stepChecks === "on",
    strictConnections: values.strictConnections === "on",
    deniedDomains: hosts,
    autoHealAttempts: values.autoHealAttempts === "" ? 2 : values.autoHealAttempts, // a form without the row keeps the default (seam; the settings package adds the row)
  });
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      fieldErrors[field] ??= [SENTENCE[field] ?? issue.message]; // one sentence per field: the first problem is the one to fix
    }

  if (!parsed.success || Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };
  return { ok: true, limits: parsed.data };
}

const blankAsMissing = (v: string) => (v.trim() === "" ? undefined : v);

// People paste addresses: "https://www.example.com/page" blocks the website www.example.com.
function toHost(line: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(line) ? line : `http://${line}`;
  try {
    const host = new URL(withScheme).hostname.toLowerCase();
    return HOST.test(host) ? host : null;
  } catch {
    return null; // "not a website" has spaces: no URL parser accepts it
  }
}
