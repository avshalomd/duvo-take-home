import { Download, FileText } from "lucide-react";
import type { FileMeta } from "@/contracts/run";

// The run's outputs, as cards you can pick up: download goes through the route so the file keeps its own name and type.
export function FilesSection({ runId, files }: { runId: string; files: FileMeta[] }) {
  return (
    <div data-testid="files">
      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          No files yet - this run writes its answer in the report below.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {files.map((f) => {
            const size = `${(f.bytes / 1024).toFixed(1)} KB`;
            return (
              <li key={f.name} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{size}</p>
                </div>
                <a
                  // the visible word is "Download"; the name a screen reader reads out says which file (Q72)
                  aria-label={`Download ${f.name} (${size})`}
                  className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none max-[899px]:min-h-10 max-[899px]:px-3"
                  href={`/api/runs/${runId}/files/${encodeURIComponent(f.name)}`}
                  download
                >
                  <Download className="size-3.5" />
                  Download
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
