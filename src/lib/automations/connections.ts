import type { RunEvent } from "@/contracts/run";

export const usedConnections = (_events: RunEvent[], _connections: { name: string }[]): string[] => []; // STUB
export const missingConnections = (_required: string[], _connections: { name: string; enabled: boolean }[]): string[] => []; // STUB
