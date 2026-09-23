import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { AgentLimits } from "@/contracts/agent";
import type { CollectFiles, OutputFile } from "@/contracts/outputs";

const MIME: Record<string, string> = {
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".svg": "image/svg+xml",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const BINARY = new Set([".xlsx"]);

/** Every file in the run's directory that we serve: the Write tool's text files and the output tools' files. */
export const collectFiles: CollectFiles = async (dir) => {
  const allowed = [...AgentLimits.fileExtensions, ...AgentLimits.toolFileExtensions] as readonly string[];
  const out: OutputFile[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const ext = path.extname(e.name).toLowerCase();
    if (!e.isFile() || !allowed.includes(ext)) continue;
    const buf = await readFile(path.join(dir, e.name));
    const encoding = BINARY.has(ext) ? "base64" : "utf8";
    out.push({ name: e.name, mime: MIME[ext] ?? "text/plain", bytes: buf.byteLength, content: buf.toString(encoding), encoding });
  }
  return out;
};
