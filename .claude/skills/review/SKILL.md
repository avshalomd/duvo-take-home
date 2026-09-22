---
name: review
description: Use when he types /review, or for a second pass after a round of fixes (only with more than fifteen minutes left) - starts the reviewer subagent in the background on a pinned commit, keeps building, then fixes only what is severe. The first pass needs no command - the qa skill starts the reviewer at R3.
---

# Review pass

The reviewer's first pass runs at R3, started by the `qa` skill beside the two QA agents, and its findings go
through `docs/QA.md` like every other. This skill is the same pass on demand: a second look after fixes, or his
`/review`.

1. Pin the target: `sha=$(git rev-parse --short HEAD)`. The review covers `git diff scaffold..$sha`, never a moving
   HEAD. `scaffold` is the stack kit as laid at T+0, so the diff is the session's work and not the kit's 60 files
   (if the tag is missing, `baseline`).
2. Launch the `reviewer` agent **in the background** with: the sha, `git diff --stat scaffold..$sha`, the
   requirement list from `docs/REQUIREMENTS.md` (Scope, aligned) and the design in `docs/DESIGN.md`, and the list of files that matter most (core logic, actions, the LLM
   module). If the `reviewer` agent type is unavailable, use a general-purpose agent with the text of
   `.claude/agents/reviewer.md` as its instructions.
3. Keep building the next slice while it runs; you are notified when it finishes.
4. Log every finding in `docs/QA.md` (source `reviewer`) and route it by the `qa` skill's rules. Fix findings that are real bugs, security issues (unvalidated input, secrets, injection) or broken requirements,
   one `fix:` commit per theme, verified with `npm run check`. Tell the human which findings you rejected and why.
5. Past FREEZE, do not fix: list the findings under Known issues in the README.
