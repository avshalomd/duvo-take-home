# Which model, and what to do when it misbehaves

**Two kinds of model are wired up, and they are not interchangeable.** An LLM writes; a decision model judges.
Reach for the one that matches the job:

| The step is… | Use | Template |
|---|---|---|
| writing text, code, or an explanation | an LLM | `runAgent()` if it needs tools, else `generateText` |
| recovering named fields from free text | an LLM | `extract()` |
| picking one of a known list, scoring on a rubric, or a yes/no | **Jev**, the decision model | `decide()` |

**Jev** (TypeSafe AI) reads a state and answers closed questions with calibrated probabilities. It never writes
text, so there is nothing to parse and no off-schema failure: the answer is always one of the options the code
listed. `src/lib/llm/decide.ts` is the client, and the section at the bottom of this file says when it fits.

The LLM is set in one place, `src/lib/ai.ts`, and overridden by two env vars without a deploy:
`AI_MODEL` (the first model) and `AI_MODEL_FALLBACK` (the second model `extract()` tries when the first fails;
`AI_MODEL_FALLBACK=""` switches it off).

**What actually runs.** Every environment that runs agents has `ANTHROPIC_API_KEY` (the agent's child needs it), and
an explicit key wins in `aiProvider()`. So locally and in production `extract()` - the reviewer, the automation
draft - asks **`claude-sonnet-5` on Anthropic** first, and **`deepseek/deepseek-v4.1-flash` on OpenRouter** second,
because the second model is on OpenRouter whenever `OPENROUTER_API_KEY` is set, whatever the first provider (the
owner's call, 2026-09-24: another vendor, so one provider's outage is not the reviewer's). There `AI_MODEL` takes an
Anthropic id and `AI_MODEL_FALLBACK` an OpenRouter slug. `openai/gpt-5.6-luna` is the first model only where
OpenRouter is the only key. `/api/health` names the first provider as `provider`.

Everything below was measured on 2026-09-20 with his OpenRouter key, on a 10-case extraction eval of a real task,
each model run through the app's own code path.

## The shortlist

| id | eval | median / max | $ per 1000 calls | ctx | JSON mode | note |
|---|---|---|---|---|---|---|
| **`openai/gpt-5.6-luna`** (first, OpenRouter alone) | 10/10 | **2.3 s** / 2.7 s | $0.28 | 1.05M | schema | fastest of the accurate ones |
| **`deepseek/deepseek-v4.1-flash`** (second, always) | 10/10 | 4.1 s / 19.5 s | $0.36 | 1.05M | schema | different vendor to the primary |
| `deepseek/deepseek-v4-flash-0731` | 10/10 | 12.8 s / 67.3 s | **$0.10** | 1.31M | schema | cheapest; slow tail |
| `inclusionai/ling-3.0-flash-fin:free` | 10/10 ×3 | **2.3 s** / 3.4 s | free | 262K | **prompt only** | fastest overall, free pool |
| `dots-studio/dots-3-note-preview:free` | 10/10 ×3 | 10.6 s / 18.0 s | free | 512K | schema | free pool |
| `nex-agi/nex-n2.5-pro:free` | 9/10 | 8.1 s / 16.5 s | free | 262K | schema | free pool |
| `liquid/lfm-2.5-2.6b:free` | 9/10 | 2.3 s / 4.5 s | free | 65K | schema | small context |

**The default is paid on purpose.** A `:free` slug can be retired without notice - `deepseek-v4-flash-0731:free`
was, mid-morning on 2026-09-20, and every production call 404'd (*"This model is unavailable for free"*) while
local work carried on happily. Free slugs also sit on shared pools that 429 under load. At these prices the whole
hour costs a few cents, and the task reimburses tokens.

## Three failures that look like a bad model and are not

1. **429, shared pool.** `Provider returned error` with `upstream_provider_shared_pool` inside it means the
   model is busy, not wrong. Two free models "scored 0/5" on this alone; every call that got through the queue
   was correct.
2. **400, no structured outputs.** Half the free models cannot be handed a JSON schema and answer
   `does not support feature: structured-outputs` to *every* schema call. `extract()` handles this itself: it
   retries once in prompt mode (the shape as JSON Schema in the instructions, the answer validated against the
   same Zod schema) and remembers the model refused. One such model went from 0/10 to 10/10 that way.
3. **The gateway's summary hides the reason.** OpenRouter's `error.message` is `Provider returned error`; the
   real words are in `error.metadata.raw`. `toLlmError()` surfaces them, and a retried call is unwrapped first
   (`RetryError.lastError`), because otherwise the message is `Failed after 2 attempts` and says nothing.

## Rules

- **An implausible score is a harness bug until proven otherwise.** A capable model scoring zero on an easy task
  is a statement about the test, not the weights. Debug the harness, read the full error body, and only then
  report the number. His control, in his words: a strong model on a basic task *should* ace it, "and if they are
  not, it's probably something wrong with our eval".
- **Never score a model that never got capacity.** Errors and rate limits belong in their own column, not in the
  accuracy column.
- **Published quality scores do not predict this.** The two highest-scored free models in the public rankings
  were the two that never answered. Observed numbers beat published ones.
- **Check what a model advertises before sending a parameter.** `GET https://openrouter.ai/api/v1/models` lists
  `supported_parameters` per model (`response_format`, `structured_outputs`, `tools`).
- **Temperature 0 for extraction.** Sampling variance shows up as dropped rows, which reads as a worse model.

## Comparing models during the hour (one command, about 20 seconds)

The eval is the bench: it runs the app's own path, so the number is the one the user would get.

```bash
AI_MODEL="<slug>" AI_MODEL_FALLBACK="" EVAL=1 npx dotenv -e .env.local -- npx vitest run src/lib/llm/*.eval.test.ts
```

If a model is slow or wrong on camera, say so out loud, switch with `AI_MODEL` (and
`.claude/scripts/set-secret.sh AI_MODEL` plus `/ship` for production), and keep going. That switch existing is
itself a design decision worth narrating.

## Jev: the decision model (`src/lib/llm/decide.ts`)

Jev answers three kinds of question, and only these three. `state` is a string, an object or an array — whatever
the decision is about.

```ts
const { answers } = await decide({
  state: email.body,
  questions: {
    needsHuman: noul("This message requires a person to act before a stated deadline."),
    kind: choice("What is this about?", { price_change: "a supplier is changing prices", other: "none of these" }),
    urgency: score("How urgent is this for the buyer?", ["not urgent", "this week", "today"]),
  },
});
if (isConfident(answers.kind)) route(answers.kind.choice);
else escalate();
```

- **noul** — does this hold? The probability *is* the answer; there is no separate confidence, so 0.02 is a
  confident **no** (`confidenceOf()` gets this right; reading the raw number as confidence inverts the decision).
- **choice** — which one? It can only answer with an option that was listed, so **include a "none of these"
  option whenever nothing may fit**. The per-option description carries more weight than a longer question.
- **score** — where on an ordered scale? The answer is a position, so 1.4 sits between two levels.

### When it fits

All four have to hold:

1. **The answer space is closed** — a label, one of a list, a point on a rubric, a yes/no.
2. **The answer is present in the text**, in one place, not assembled across several steps of reasoning.
3. **The judgment repeats** — many rows, or many times per second — so speed and price matter.
4. **Code owns the workflow.** Jev decides; the code retrieves, branches, calculates and acts.

Good fits in an app like this one: routing a message to a queue, triaging severity, flagging a row for review,
filtering a list before an expensive call, and **checking another model's output** — whether an extraction is
supported by the source text, whether a tool call looks wrong — for a fraction of what a second LLM call costs.

Do **not** reach for it when the output has to be written text or code, when the question needs several chained
reasoning steps (its documented weak spot), when the input is an image (it reads text only), or when it is a
one-off question where an LLM is simply less trouble.

### Two patterns worth using

- **Ask everything at once.** Independent questions are answered in parallel in one request, so the speculative
  ones are free: ask "if this IS a refund request, what is the reason?" alongside "is this a refund request?" and
  read only the branch that applied. A second call is justified only when an answer changes what you must ask next.
- **Split by confidence.** Act on the confident answers, send the rest to a person or to a reasoning model.
  This works because the probabilities are **calibrated** — of the answers given 0.9, about 90% are right *as a
  group*. That says nothing about the single answer in front of you, so pick the threshold from labelled cases of
  your own, never by taste. Typed output guarantees the shape, never the truth.

### The limits to design around

- **32,000 tokens**, and accuracy falls as the state grows well before that. `stateTooLong()` is the guard; cut
  the state down (retrieve the relevant part) rather than sending everything.
- **No text out.** Anything that must be written needs an LLM beside it.
- **One judgment per question.** Split a compound question by *meaning*, not into trivia.

### Routes and keys

Three routes to one model, all verified working on 2026-09-20 and again on 2026-09-21. `routesFor()` lists the
configured ones, **paid** first, and `decide()` walks that list: a route that fails (down, slow, out of credit)
hands the same question to the next one, and if all fail the error shown is the FIRST route's, the one that was
meant to work. Pinning `route:` in a call switches the failover off.

| order | route | key | note |
|---|---|---|---|
| 1 | TypeSafe's own API | `TYPESAFE_API_KEY` (or `TYPESAFE_AI_API_KEY`) | paid, no intermediary |
| 2 | OpenRouter | `OPENROUTER_API_KEY` | paid, the key the bootstrap sets anyway |
| 3 | Vercel AI Gateway | `AI_GATEWAY_API_KEY`, or the OIDC token `vercel env pull` writes | **free today**, so its throughput is nobody's promise |

The free route ranks last on purpose, and it is the same reasoning as the paid LLM default: a free tier
throttling under load is indistinguishable from a broken model, and the whole hour on a paid route costs cents.
Use the gateway when it is the only thing configured, or to save a secret in a throwaway.

`JEV_MODEL` overrides the id. The default is pinned rather than `jev-latest`, because a moving model moves the
thresholds under a tuned decision. An override is written in ONE route's naming, so it also narrows `decide()` to
the first configured route: no failover while it is set.

A question the model leaves unanswered is an `off-schema` error naming the question, never a silent `undefined`.

The gateway route goes through the AI SDK's `experimental_evaluate`, which ships inside `ai` — no new dependency.
It is *experimental* and its shape may change in a patch release, so nothing outside `decide.ts` touches it. It
also speaks a different dialect, in four ways, each of them a silent wrong answer if the translation slips: a noul
question is called `boolean`; its answer carries `probability` instead of `noul`; confidence lives in
`providerMetadata.typesafe.confidence` rather than on the answer; and **a score comes back with no `legend`**, so
the level names have to be rebuilt from the question that was sent. `decide.ts` normalises all four and
`decide.test.ts` pins them.

`decide.eval.test.ts` runs one real decision through the default routing and through every route a key exists for,
and checks the answers arrive in this file's shape. It is skipped unless `EVAL=1`, like the other live checks, so
`npm run check` and `npm run test:int` never depend on a provider's good minute:
`EVAL=1 npx dotenv -e .env.local -- npx vitest run src/lib/llm/decide.eval.test.ts`. It costs a fraction of a cent, it is worth running before the clock
starts — and the missing legend above is exactly what it caught, which no mock was ever going to show.

## Picking a different slug entirely

The shortlist above is this task's. The general one - every OpenRouter model verified against a live probe,
which free slugs actually answer today, and the same three failure classes - lives outside the exercise in
`~/.claude/skills/openrouter-models/` (`results.md` for the table, `models.py probe` to re-verify). Reach for it
when a slug dies mid-hour and nothing here fits.
