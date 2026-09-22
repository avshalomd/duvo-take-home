# QA

## R3 - the merged app on :3000 (T+45 to T+48, orchestrator's walk)

| # | severity | finding | owner | status |
|---|---|---|---|---|
| 1 | - | Live run from the form: succeeded in 1 min 29 s, $0.39; plan of 4 steps with the agent's notes, state card, timeline, output.csv downloadable (attachment header), verdict pass with 7 checks and Jev 0.90 / 0.93 | - | verified |
| 2 | minor | The seeded "running" fixture run never finished, so its panel polled for ever | data | fixed at T+58: the seeded row was deleted from the database |
| 3 | minor | `reevaluateRun`'s two database queries have no integration test | eval | open, listed in the README |

No open blocker.

## R4 - the live URL

The midway deploy (T+44) passed the smoke test (health, home page). The last deploy carries the merged page; a live
run there needs `ANTHROPIC_API_KEY` on Vercel, which was not set during the hour.
