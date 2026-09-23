import type { ParseCommand } from "@/contracts/automation";

/** "\audit Apple Inc." or "/audit Apple Inc." -> { command: "audit", input: "Apple Inc." }; anything else -> null. */
export const parseCommand: ParseCommand = () => null; // STUB: the automations package
