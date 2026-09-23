import { StartRunInput } from "@/contracts/agent";
import { parseCommand } from "@/lib/automations/command";

/**
 * The new run's title, worked out in the browser at the press, so the brief can move into it before the server has
 * answered (Q138). It names the run the way the run page will (runTitle in rail.ts): the first line of plain
 * instructions, or "<automation>: <input>" for a command.
 *
 * null when the server is going to refuse the start before a run exists - instructions too short, an unknown
 * command, a command with no input - so the brief never flies up only to fall back into the box. The checks are the
 * server's own: the same contract and the same command parser.
 */
export function handoverTitle(text: string, ready: { command: string; name: string }[]): string | null {
  const command = parseCommand(text.trim());
  if (command) {
    const automation = ready.find((a) => a.command === command.command);
    return automation && command.input ? `${automation.name}: ${command.input}` : null;
  }
  if (!StartRunInput.safeParse({ prompt: text }).success) return null;
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? null;
}
