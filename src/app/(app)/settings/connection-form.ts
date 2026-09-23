import type { ConnectionEdit, NewConnection } from "@/contracts/connection";

export type ConnectionFormResult =
  | { ok: true; input: NewConnection | ConnectionEdit }
  | { ok: false; fieldErrors: Record<string, string[] | undefined>; values: Record<string, string> };

export function parseConnectionForm(_form: FormData, _mode: "add" | "edit"): ConnectionFormResult {
  throw new Error("not implemented yet");
}
