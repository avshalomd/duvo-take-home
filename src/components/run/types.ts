import type { FileMeta, Run, RunEvent, RunState } from "@/contracts/run";
import type { Verdict } from "@/contracts/eval";

// Everything the panel shows for one run. The page builds it on the server; the poll of /api/runs/[id]
// refreshes the first four fields, which is why they are exactly the route's payload.
export type RunView = {
  run: Run;
  events: RunEvent[];
  files: FileMeta[];
  state: RunState;
  verdict: Verdict | null;
};
