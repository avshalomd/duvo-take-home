import { Download, FileSpreadsheet, FileText, Info, ShieldAlert } from "lucide-react";
import type { FileMeta } from "@/contracts/run";
import { fileKind, flagLine } from "./file-kind";

const buttonClass =
  "flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none max-[899px]:min-h-10 max-[899px]:px-3";

// The run's outputs, as cards you can pick up: download goes through the route so the file keeps its own name and
// type. A chart is shown as a picture, a spreadsheet says it is one, and a file the output scan held back asks first.
export function FilesSection({ runId, files }: { runId: string; files: FileMeta[] }) {
  return (
    <div data-testid="files">
      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          No files yet - this run writes its answer in the report below.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {files.map((f) => (
            <FileCard key={f.name} runId={runId} file={f} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileCard({ runId, file }: { runId: string; file: FileMeta }) {
  const url = `/api/runs/${runId}/files/${encodeURIComponent(file.name)}`;
  const size = `${(file.bytes / 1024).toFixed(1)} KB`;
  const kind = fileKind(file.name);
  const flags = flagLine(file.flags);
  const Icon = kind === "spreadsheet" ? FileSpreadsheet : FileText;

  return (
    <li className={`flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 ${kind === "chart" && !file.quarantined ? "sm:col-span-2" : ""}`}>
      {kind === "chart" && !file.quarantined && (
        // inline=1 asks the route to serve it for display rather than as a download
        // eslint-disable-next-line @next/next/no-img-element -- a generated file behind our own route, not a static asset for next/image
        <img src={`${url}?inline=1`} alt={`Chart: ${file.name}`} className="max-h-64 w-full rounded-md border bg-white object-contain" />
      )}
      <div className="flex items-center gap-3">
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {kind === "spreadsheet" ? `Spreadsheet · ${size}` : kind === "chart" ? `Chart · ${size}` : size}
          </p>
        </div>
        {!file.quarantined && (
          // the visible word is "Download"; the name a screen reader reads out says which file (Q72)
          <a aria-label={`Download ${file.name} (${size})`} className={buttonClass} href={url} download>
            <Download className="size-3.5" aria-hidden />
            Download
          </a>
        )}
      </div>

      {flags && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden />
          {flags}
        </p>
      )}

      {file.quarantined && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs">
          <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <span className="min-w-0 flex-1">This file seems to contain a password or key, so it was held back.</span>
          {/* confirm=1 is the route's "I know": the person chose to take it anyway */}
          <a aria-label={`Download anyway: ${file.name}`} className={buttonClass} href={`${url}?confirm=1`} download>
            Download anyway
          </a>
        </div>
      )}
    </li>
  );
}
