// QA names what it creates "[e2e] ..." so its clean-up can find and delete it (CLAUDE.md, production rules). The agent
// read the tag as the subject of an ambiguous brief ("[e2e] Make me a list of the best ones" became a list of
// end-to-end testing tools, qa-ai F13), so the models are sent the brief without it. The stored run keeps its prompt
// as typed: the clean-up, Run again and the run's title still see the tag.
const LEADING_TAG = /^\s*\[e2e\]\s*/i;

/** The instructions as the agent, the step checks and the evaluator read them: a leading "[e2e]" tag taken off. */
export function withoutTestTag(prompt: string): string {
  return prompt.replace(LEADING_TAG, "");
}
