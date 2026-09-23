export function commandQuery(text: string): string | null {
  void text;
  return null;
}

export function applyCommand(text: string, command: string): string {
  void command;
  return text;
}

export function commandWord(text: string): string | null {
  void text;
  return null;
}

export function filterAutomations<T extends { command: string; name: string }>(list: T[], query: string): T[] {
  void query;
  return list;
}
