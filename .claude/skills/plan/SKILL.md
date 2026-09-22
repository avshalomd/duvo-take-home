---
name: plan
description: Use when the design is approved (T+17) - writes docs/PLAN.md (WP0 on main, then the parallel packages of the size he picked at the design gate, each with owned files, a test-first test plan, phases and a review point), posts it by T+19 and hands over to build without waiting; he stops it if he sees something.
---

# Plan (T+17 to T+19): posted, not gated

Write `docs/PLAN.md` yourself, now, from the approved design and the size he picked. It takes about a minute once
the design exists (sim 3: 40 seconds); a background draft agent took 11 minutes and missed the gate, so there is
none. Never keep two versions.

## What docs/PLAN.md holds

1. **WP0 - main thread, T+19 to T+22**, with one line on why it comes first: every package branches from the
   commit WP0 ends on, so everything the packages share must be in it. It lands, tests first:
   - **tests first**: the contract tests (each schema accepts a fixture and rejects a broken one) and one test per
     stub signature, in `src/contracts/*.test.ts` (main's files, so no package collides with them), drafted by
     the `wp0-tests` agent during the design read and committed as `test: WP0 contracts` before anything else;
   - the schema pushed (`npm run db:push`) and the seed loading `fixtures/` (`npm run seed`);
   - contracts and stubs compiling, `npm run check` green;
   - fixtures and `docs/NOTES.md` committed (an untracked file never reaches an agent's worktree);
   - every shadcn component the screens need, added now (`src/components/ui/` and `package.json` stay main's);
   - one page rendering fixture data through the stubs;
   - committed and pushed (with the `scaffold` tag). No deploy: the first one is offered, never started (`ship`).
2. **Packages** - the size he picked at the design gate (his call); within it, as many packages as the contracts
   allow. A package
   is a set of files nobody else touches plus the contract it provides or uses: one per implementation behind a
   contract (data, LLM, ...) and one per screen group whose files do not overlap. For each:
   ```
   ### P1 - <name>
   - agent: P1; worktree/branch: created at spawn (isolation: worktree), filled in when it reports
   - port: 3001                  (UI packages only, 3001+ in plan order; main is 3000)
   - owns: src/app/orders/**, src/components/orders/**
   - contract: uses src/contracts/orders.ts
   - tests first (written and failing before the code, committed as `test(P1): ...`):
       - <file>: <the behaviour each test pins, one line per test>
   - then the code: <what makes those tests pass>
   - phase A -> R1, T+25: <what exists>; he looks at: <two or three things>
   - phase B: <the rest, up to done>
   - done when: <observable, checked by a command or a page>
   ```
   A provider's contract line reads `provides src/contracts/<seam>.ts via <the stub files it owns>`.
   Put the earliest reviewable first: the UI on fixtures, or the LLM's outputs over the fixtures as a table.
   **A UI package's phase A is its screens on the stubs' fixture data and nothing else**, reported within about
   eight minutes of the fan-out; the interactions come in phase B. In sim 3 R1 came at T+35, and nothing reached
   him to review between the plan and the first merge. A
   package with nothing to show on its own (data, API) ends phase A when its tests pass and is reviewed at R3.
3. **What the tests pin, per kind of package:** the deterministic logic (the arithmetic, the rules, the matching)
   with plain unit tests on fixture values, edge cases included; the LLM step with `MockLanguageModelV4` (the
   happy path, off-schema output, a timeout) plus the eval over `fixtures/llm-cases.json`; data access with
   `*.int.test.ts` that delete what they create; a UI package with one Playwright test of its screen on fixtures
   (the owner of the main flow's page writes `e2e/flow.spec.ts`).
4. **Ownership** - no glob in two packages. Main keeps `src/contracts/`, `src/db/schema.ts`, `fixtures/`,
   `package.json`, `src/components/ui/`, `CLAUDE.md` and `docs/`, bar a package's own output such as `docs/EVAL.md`.
   A package that needs to change one of these stops and reports.
5. **Review points** - a table: R, package, what, url or path, look at, ETA. R1 is the UI on fixtures (one row per
   UI package), R2 the model and data outputs (the eval table), R3 the integrated flow on :3000, R4 the live URL.
   Rows may share an R; each names its package. Every row becomes one chat line when it is reached:
   `REVIEW R<n> - <what> - <url or path> - look at: <two or three concrete things>`
   Typical ETAs: R1 about T+25, R2 about T+28, R3 about T+36, R4 T+45. A review point never pauses its agent:
   it is told to continue in the turn the line is posted, and his comments are routed when they come.
6. **Merge order** - packages merge **on arrival**, whichever reports done first. This line only breaks a tie and
   names the seams to expect: data first, then the LLM, then the UI packages.
7. **Checks at the end** - `grep -rn "// STUB" src` empty before R3 (bar what was cut); the e2e flow on main after
   the merges; the read-only production smoke (`e2e/smoke.spec.ts`, run by `.claude/scripts/deploy.sh`); QA at R3
   and R4 by the `qa` skill.

## Post it and go

8. `.claude/scripts/gate.sh plan`, `git add docs/PLAN.md && git commit -m "docs: plan" -- docs/PLAN.md && git push`.
9. Post in chat, short: one line per package (id, what it owns, its first tests, its review point and ETA), the
   merge order, the one risk to watch, then the status block. **Do not wait for approval**: run the `build` skill
   in the same turn. If he objects to something while it builds, patch the plan and route the change to the
   agent that owns it.
