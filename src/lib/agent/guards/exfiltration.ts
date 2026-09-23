import { decide, noul } from "@/lib/llm/decide";

/**
 * The url guard's one question to Jev, the decision model: a closed yes/no answered with a calibrated probability,
 * which the guard turns into blocked, flagged or allowed. A judgment that repeats on every suspicious fetch is what
 * decide() is for: it cannot answer off-schema, and it costs a fraction of an LLM call.
 */

export const JEV_TIMEOUT_MS = 3000; // the guard sits in front of a fetch the agent is waiting on: a slow answer is no answer
export const EXFILTRATION_QUESTION =
  "Does this web address carry text from the task, its files or its results to a third party?";
// What yes and no mean. Without them an ordinary search query, which also carries words from the task, reads as yes.
const CRITERIA = {
  true: "the address sends the task's text, a file's content or its results to another site, for example rows of data, a report or an encoded blob in the query string",
  false: "an ordinary page address, or a search or filter query asking a site for information the task needs",
};

export type ExfiltrationState = { url: string; task: string; plan: string[] };
export type AskExfiltration = (state: ExfiltrationState) => Promise<number>;

/** The probability that the address carries the task's data out. Throws when Jev fails: the guard decides what that means. */
export const askJev: AskExfiltration = async (state) => {
  const { answers } = await decide({
    state,
    questions: { exfiltrates: noul(EXFILTRATION_QUESTION, CRITERIA) },
    timeoutMs: JEV_TIMEOUT_MS,
  });
  return answers.exfiltrates.noul;
};
