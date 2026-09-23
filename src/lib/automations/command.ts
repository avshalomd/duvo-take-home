import type { ParseCommand } from "@/contracts/automation";

/** "\audit Apple Inc." or "/audit Apple Inc." -> { command: "audit", input: "Apple Inc." }; anything else -> null. */
export const parseCommand: ParseCommand = () => null; // STUB: the automations package

export const toCommandName = (raw: string): string => raw; // STUB
export const nextFreeCommand = (base: string, _taken: string[]): string => base; // STUB
