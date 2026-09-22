---
name: verify
description: Use after each slice and before every commit that claims a feature works - runs the fast gate, exercises the changed flow in a real browser, and keeps one e2e test on the main flow.
---

# Verify a slice

1. `npm run check` (typecheck, lint, unit tests). Fix failures before anything else. If the slice changed a
   multi-row write, also `npm run test:int`.
2. Exercise the changed flow for real against a running server - on main that is the desktop preview on :3000
   (`preview_start`, name `app`; never `npm run dev` from Bash, which takes the preview's port), in a worktree
   `.claude/scripts/wt-serve.sh . <your port>`. Then drive the page in a browser
   (Playwright MCP when it is available, the preview pane in the desktop app, or a quick Playwright script) or at
   least `curl` the route. Check the happy path and one failure path. Read the dev server output for errors.
3. When the main flow exists, keep exactly one Playwright test for it in `e2e/flow.spec.ts` (happy path, role and
   label selectors, creates its own records) and run `npm run test:e2e`. Do not chase broad e2e coverage.
4. Report in two or three lines: what was checked, how, and the result. "It compiles" is not verification.
