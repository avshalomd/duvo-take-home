---
name: qa
description: Use when the merged app is up on :3000 (R3) or live after the last deploy (R4), and whenever he reports a bug - runs two QA agents (functional, UX review) and the code reviewer, all reporting findings only, logs every finding in docs/QA.md and routes it to the package that owns the file while the other agents keep building. His own click-through script is optional.
---

# QA (R3 and R4)

Two QA agents test and the reviewer reads the diff; you log and route; the packages fix. One pipeline for every
finding, whoever found it. The agents report findings, they never fix or commit.
`docs/QA.md` is the main thread's file; agents never edit it. Never write that QA passed on a green unit test
alone: a pass is a flow walked in a browser.

## Early: the UX pass at the first UI merge

The UX review needs screens, not the integrated flow. Start **`qa-ux`** (its prompt is under R3) as soon as the
first UI package is merged and :3000 shows it, so its findings reach the UI agents while they are still building.
Log and route them as below; an XS finding on a UI file whose agent has finished goes to `polish` (`build`,
section 5b).

## R3: on the merged app (:3000)

Precondition: the packages due at R3 are merged into main, `npm run check` passes, the preview serves :3000.

1. Start all three in ONE message, `run_in_background: true` (`qa-ux` is already known from the early pass:
   SendMessage it "The app is integrated. Walk it again; report new findings only, and re-check <the Q ids it
   raised>."):
   - **`qa-func`** - general-purpose, `model: "opus"`, `isolation: "worktree"` (a copy of merged main, for the LLM-down server).
     Prompt: read `docs/REQUIREMENTS.md` (the Must list) and `docs/DESIGN.md` (screens, states). Walk every Must
     end to end on `http://localhost:3000` with Playwright (`npx playwright` scripts under `test-results/qa/`,
     never committed) or `curl`, using inputs from `fixtures/`. Then the failure paths: empty and bad input, a
     reload in the middle of the flow, and LLM down: run `.claude/scripts/wt-setup.sh`, then
     `AI_SIMULATE_DOWN=1 .claude/scripts/wt-serve.sh . 3009` in your worktree and walk the LLM step there;
     `.claude/scripts/wt-serve.sh --stop 3009` after. Name anything you create `[e2e] ...` and delete it. Never
     print a secret. Do not edit or commit anything. Report one line per finding:
     `<blocker|major|minor> - <step> - observed <...> - expected <...> - likely file <path>`, then one line per
     Must: `pass` or the finding.
   - **`qa-ux`** - general-purpose, `model: "opus"`, no worktree. Prompt: screenshot every screen and state of
     `http://localhost:3000` at 1280 px and 390 px wide (`npx playwright screenshot`, into `test-results/qa/`) and
     read the images. Review as the task's user: is the primary action obvious, are the empty, loading and error
     states real, labels in the user's words, numbers aligned and formatted, anything overflowing on mobile,
     keyboard focus visible. Do not edit or commit anything. Report the same finding lines, severity `minor` unless
     the flow is blocked, plus up to three XS polish ideas.
   - **`reviewer`** - `subagent_type: "reviewer"` (no `model`: it inherits this session's Fable, his choice for reviewing the agents' work). Pin the target first:
     `sha=$(git rev-parse --short HEAD)`. Prompt: the sha, `git diff --stat scaffold..$sha`, and the files that
     matter most (the core logic, the actions, the LLM module). It reads the diff since the `scaffold` tag against
     the requirements and the design and reports in the same finding lines. No agent type available: a general-purpose agent with `.claude/agents/reviewer.md` as its instructions and no
     `model`, so it stays on this session's model.
2. While they run, keep merging and building. Post `REVIEW R3 - integrated flow - http://localhost:3000 - look at:
   <two or three things>` so he can click too if he wants.
3. **If he asks for a click-through script** (optional), write the Script table in `docs/QA.md`: 8-12 numbered
   steps covering the main flow, one failure path and the empty states, with sample inputs from `fixtures/` in one
   code block each.

## Logging and routing

Every finding, from an agent or from him (free text, one or several at once):

1. Append a row to the Bug log in `docs/QA.md`: `id` Q1, Q2, ... in order; `source` qa-func, qa-ux, reviewer or him;
   `observed` and `expected`, short; `severity` `blocker` (the main flow fails), `major` (a Must behaves wrong),
   `minor` (polish); `owner` - the file behind it matched to the ownership globs in `docs/PLAN.md` (contracts,
   schema, a seam or no match: `main`); `status` `fixing`, then `re-check`, then `fixed`; `open` while it waits.
2. Post one line per finding: `LOGGED Q<n> - <severity> - <owner>`, then the status block.
3. Route, blockers first; the other agents keep building:
   - **Owner agent still alive**: SendMessage to it by name, one message per owner, blockers on top:
     `Q<n> (<severity>): observed <...>, expected <...>. Likely file: <path>. git merge main first, then a failing test, the fix, commit, report the sha.`
   - **A UI file whose agent is gone, while `polish` runs**: SendMessage `polish`, same format.
   - **Owner is `main`, or its agent is gone**: fix it on the main thread, test first where the bug is logic, run
     the `verify` skill, commit `fix: Q<n> ...`.
   - When an agent reports: merge its branch, `npm run check`, commit with `docs/QA.md` updated.
4. **Fix landed**: `FIXED Q<n> - <how it was checked>`, status `re-check`. It becomes `fixed` when the agent that
   found it (SendMessage it the Q id to re-walk) or he confirms it. Minor findings from `qa-ux` that are XS go
   through the build skill's initiative rule.

## R4: the live URL

After the last feature deploy: SendMessage `qa-func` (or start it again, `model: "opus"`, no worktree needed) to walk the Musts on
the URL in `.vercel/prod-url`, read-only bar `[e2e]` records it deletes, and report in the same format. Post
`REVIEW R4 - live - <URL> - look at: <the main flow>`. A fix there is only re-checkable after a deploy (the `ship`
skill), so fix blockers only.

## Freeze and wrapup

After FREEZE (T+50) fix only blockers; every other row stays `open`. At wrapup, every row not `fixed` goes into the
README's "Not done yet" section as a known issue, one line each with its Q id.
