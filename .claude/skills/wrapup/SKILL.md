---
name: wrapup
description: Use at FREEZE (T+50 on the clock, or when the human says wrap up) - stops feature work, makes everything green, writes the final README, ships, pushes and gives him the end report in his order (the design delivered, the interfaces, then built vs cut and the links).
---

# Wrapup (the last ten minutes)

1. `.claude/scripts/gate.sh freeze`. Stop feature work and start no new agent; a running one is merged if it is
   green within two minutes, else stopped. Anything half-built is either finished in two minutes or hidden (remove
   the link or the button) - the live app must not show a broken path.
2. `npm run check`; fix only failures.
3. The `qa` skill's final check: every row of `docs/QA.md` not `fixed` goes into the README with its Q id. An open
   blocker is fixed now, or its path is hidden and its row says so; never leave it live.
4. Finish `README.md` (keep it scannable, no marketing). **The product and the software only** (his rule, sim 3:
   he had it sanitised at T+58): no gates, clock, agents, packages, review points or "how it was built" anywhere
   in the README or the GitHub repo description (`gh repo edit --description`, one line on the product).
   - one-line description and the **live URL**
   - what it does: the core flow in 3-6 steps
   - how to run locally (env vars by name, `npm i`, `vercel env pull .env.local` or the keys, `npm run db:push`,
     `npm run dev`)
   - architecture: the module map, the interfaces (the LLM output schema) and the tables, short; link
     `docs/DESIGN.md` and `docs/CODE-TOUR.md`
   - decisions and trade-offs: the Assumptions in `docs/REQUIREMENTS.md`, the choices in `docs/DESIGN.md`, plus
     what changed during the hour
   - **Extras**: the UX extras added beyond the requirements, one line each
   - tests: what is covered (unit, integration, eval with its pass rate, e2e, the production smoke)
   - not done, known issues, next steps: the Should and Won't tiers, honestly, the open QA items and any review
     findings not fixed
5. Offer the final deploy, as its own message: `DEPLOY? /ship - <what changed since the last one> - last deploy: T+<nn>`. On his word, run the `ship` skill (deploy, smoke, push). If he does not want one, the README describes what is live now and labels what is only pushed.
6. `git log --oneline baseline..HEAD` and `git status` must show everything committed and pushed. Then
   `.claude/scripts/gate.sh pushed`.
7. **The end report, in chat, in this order** (his order; he reads it on camera):
   1. **The design delivered** - where the app is (the live URL, and the repo), what the user can do (the core
      flow in 3-6 steps), and the code structure (the module map: which folder holds what).
   2. **The interfaces** - the LLM output schema (the seam between the model and the deterministic logic), pasted;
      the module functions by signature, one line each; the tables as headlines (`table: field type, ...`, the why
      where it is not obvious).
   3. **Built vs cut** - the Musts and Shoulds built, the extras, what was cut and why; the tests and the eval
      pass rate; the open QA items.
   4. **Walk-through** - at most six lines: what to click in the live app, in which order, and the two decisions
      worth saying out loud.
   5. **Links** - live URL, repo, `README.md`, `docs/DESIGN.md`, `docs/CODE-TOUR.md`, `docs/EVAL.md`.
