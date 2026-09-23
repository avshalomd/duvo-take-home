import type { FileMeta } from "@/contracts/run";

export function fileResponse(_file: { meta: FileMeta; content: string }, _search: URLSearchParams): Response {
  throw new Error("not built yet");
}
