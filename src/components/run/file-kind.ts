import type { FileFlag } from "@/contracts/run";

export type FileKind = "chart" | "spreadsheet" | "document";

export function fileKind(name: string): FileKind {
  void name;
  return "document";
}

export function flagLine(flags: FileFlag[] | undefined): string | null {
  void flags;
  return null;
}
