import type { MapMessage } from "@/contracts/agent";

// One mapper per run: it holds that run's plan, so two runs in one process never share plan state.
export const createMapper = (): MapMessage => () => []; // STUB - one SDK message in, zero or more RunEvents out
