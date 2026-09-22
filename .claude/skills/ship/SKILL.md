---
name: ship
description: Use when he asks to deploy (/ship, "deploy", "put it live") - deploys to Vercel production with the CLI, smoke-tests the live URL and records it. Deploys never happen on their own - the harness offers, he decides.
---

# Ship: deploy, on his word

**Nothing deploys automatically.** No git integration builds on push (`vercel.json` sets
`git.deploymentEnabled: false`), no background deploy runs at a gate, and the wrapup does not deploy by itself.
A deploy happens when he asks for one, and this skill is how it is done.

## Offer it, do not do it

Post it as its own message, with nothing else in it, at each of these points, and carry on with the build while
he decides (inside a longer message it is missed: sim 3):

`DEPLOY? /ship - <what would go live> - last deploy: <T+nn | never>`

- WP0 is green and pushed (about T+22): the skeleton on stubs. A live URL this early is cheap insurance.
- Midway, when the first package or two are merged.
- By T+45, with everything merged: this is the deploy the README describes.
- At wrapup, if anything landed since the last one.

He says `/ship` (or "deploy"), and only then:

## The deploy

1. Precondition: `npm run check` passes and the work is committed.
2. If `src/db/schema.ts` changed since the last deploy: `npm run db:push`.
3. If the app needs a secret that is not on Vercel yet, stop and ask him to run
   `.claude/scripts/set-secret.sh NAME` in his own terminal. Never handle the value yourself.
4. Run `.claude/scripts/deploy.sh` **in the background** and keep working; read its result when it finishes.
   It deploys to production with the Vercel CLI (`vercel deploy --prod`; after 180 s it cancels that build and
   retries with a local build uploaded as `--prebuilt`), finds the public production URL, checks
   `/api/health?deep=1` (database, and whether the model really answers) and runs the read-only smoke test.
   `SMOKE FAILED` means the deploy is up but the read-only smoke (`e2e/smoke.spec.ts`: health, and an `h1` on the
   home page) did not pass: read `.vercel/smoke.log`, fix the page or the test, and offer the deploy again.
   A WARNING about the LLM means the key is missing or the model slug is rejected in production - say so at once
   and name the error, because it is the app's core feature failing where he cannot see it. On a build failure
   read `vercel inspect --logs <deployment-url>`, fix, and offer the deploy again. If it fails twice, the previous
   deploy is still live: say so, keep building, demo locally, and label anything pushed but not deployed in the
   README.
5. Put the production URL at the top of `README.md` if it is not there, commit (`chore: deploy` or with the
   slice), `git push`. Say the URL out loud in the reply so he can open it on camera, and put the deploy time in
   the status block.
6. After the last deploy of the hour is live and its smoke passes, run `.claude/scripts/gate.sh last-deploy`.

Deploys cost minutes and Vercel's queue can stall, so three in an hour is the sensible number: the skeleton, one
in the middle, and the last one by T+45.
