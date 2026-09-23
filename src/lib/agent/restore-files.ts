import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredFile = { name: string; content: string; encoding: string };

/** Write an earlier run's stored files into a working directory; answers the names and sizes written. */
export async function restoreFiles(dir: string, files: StoredFile[]): Promise<{ name: string; bytes: number }[]> {
  await mkdir(dir, { recursive: true });
  const written: { name: string; bytes: number }[] = [];
  for (const f of files) {
    const name = path.basename(f.name); // stored names are bare file names; basename keeps an odd row inside the directory
    const bytes = Buffer.from(f.content, f.encoding === "base64" ? "base64" : "utf8"); // .xlsx is stored as base64
    await writeFile(path.join(dir, name), bytes);
    written.push({ name, bytes: bytes.byteLength });
  }
  return written;
}
