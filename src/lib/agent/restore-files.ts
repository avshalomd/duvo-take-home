export type StoredFile = { name: string; content: string; encoding: string };

/** Write an earlier run's stored files into a working directory; answers the names and sizes written. */
export async function restoreFiles(dir: string, files: StoredFile[]): Promise<{ name: string; bytes: number }[]> {
  throw new Error(`not implemented: restoreFiles(${dir}, ${files.length})`);
}
