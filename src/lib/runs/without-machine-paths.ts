import { relativeToRun, runFolders } from "@/components/run/format";

type WithEvents = { events: { kind: string; payload: unknown }[] };

/**
 * A run as the API answers it, with the machine's own folder taken off every path (QA F20): "/Users/.../runs/<id>/
 * greeting.txt" reads "greeting.txt", as the page shows it (format.ts, Q187). The folder names the machine's layout,
 * which is not the caller's. Done on the whole answer as JSON text, so a path is caught wherever it sits - a tool's
 * input, its result, the report - and the started event's own record of the folder is dropped.
 */
export function withoutMachinePaths<T extends WithEvents>(found: T): T {
  const folders = runFolders(found.events);
  if (folders.length === 0) return found;
  const stripped = JSON.parse(relativeToRun(JSON.stringify(found), folders)) as T; // a folder path holds no character JSON escapes
  stripped.events = stripped.events.map((e) => {
    if (e.kind !== "started") return e;
    const payload = { ...(e.payload as Record<string, unknown>) };
    delete payload.cwd;
    return { ...e, payload };
  });
  return stripped;
}
