import { Download, FileSpreadsheet, FileText, Info, ShieldAlert, Table2 } from "lucide-react";
import type { FileMeta, RunEvent } from "@/contracts/run";
import { cn } from "@/lib/utils";
import { csvLine, fileKind, flagLine, formatBytes, noFilesLine, sheetsLine, tileSheets } from "./file-kind";
import type { FileFacts } from "./home-data";

const pill =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-[13px] font-medium shadow-tile transition-transform duration-100 active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none max-[899px]:min-h-10";

// What the run made, as deliverables you can pick up: a chart shows itself, a CSV says its rows and columns, a
// spreadsheet names its sheets. Downloads go through the route, so each file keeps its own name and type.
export function FilesSection({
  runId,
  files,
  events,
  facts,
  status,
  hasReport,
}: {
  runId: string;
  files: FileMeta[];
  events: RunEvent[];
  facts: FileFacts;
  status: string;
  hasReport: boolean;
}) {
  return (
    <div data-testid="files">
      {files.length === 0 ? (
        <p className="text-[15px] text-slate">{noFilesLine(status, hasReport)}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {files.map((f) => (
            <FileTile key={f.name} runId={runId} file={f} events={events} facts={facts} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileTile({ runId, file, events, facts }: { runId: string; file: FileMeta; events: RunEvent[]; facts: FileFacts }) {
  const url = `/api/runs/${runId}/files/${encodeURIComponent(file.name)}`;
  const size = formatBytes(file.bytes);
  const kind = fileKind(file.name);
  const fact = facts[file.name];
  const csv = fact && "columns" in fact ? fact : null;
  // a spreadsheet's sheets come from the call that made it: this run's, or the run a follow-up carried it over from
  const sheets = kind === "spreadsheet" ? tileSheets(file.name, events, fact && "sheets" in fact ? fact.sheets : []) : [];
  const line = kind === "spreadsheet" ? sheetsLine(sheets) : kind === "chart" ? "Chart" : csv ? csvLine(csv) : null;
  const flags = flagLine(file.flags);
  const Icon = kind === "spreadsheet" ? FileSpreadsheet : csv ? Table2 : FileText;
  const chart = kind === "chart" && !file.quarantined; // a held-back file is never opened, not even as a picture

  return (
    <li className={cn("flex flex-col gap-3 rounded-[16px] bg-mist/70 p-4", chart && "sm:col-span-2")}>
      {chart && (
        // inline=1 asks the route to serve it for display rather than as a download. The box is paper, not white: the
        // chart's own @media (prefers-color-scheme) is answered by this element's colour scheme (the browser passes
        // it into the image), and paper follows the same scheme, so the chart's text and its ground always agree.
        // eslint-disable-next-line @next/next/no-img-element -- a generated file behind our own route, not a static asset for next/image
        <img src={`${url}?inline=1`} alt={`Chart: ${file.name}`} className="max-h-80 w-full rounded-[12px] bg-paper object-contain" />
      )}
      <div className="flex items-start gap-3">
        {!chart && <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-slate" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{file.name}</p>
          {line && !chart && <p className="mt-0.5 text-[13px] leading-5 tracking-[0.01em] text-slate">{line}</p>}
          <p className="mt-0.5 text-[13px] tracking-[0.01em] text-slate tabular-nums">{size}</p>
        </div>
        {!file.quarantined && (
          // the visible word is "Download"; the name a screen reader reads out says which file (Q72)
          <a aria-label={`Download ${file.name} (${size})`} className={pill} href={url} download>
            <Download aria-hidden className="size-3.5" />
            Download
          </a>
        )}
      </div>

      {flags && (
        <p className="flex items-center gap-2 text-[13px] tracking-[0.01em] text-slate">
          <Info aria-hidden className="size-3.5 shrink-0" />
          {flags}
        </p>
      )}

      {file.quarantined && (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-saffron-wash px-3 py-2.5 text-[13px] leading-5">
          <ShieldAlert aria-hidden className="size-4 shrink-0 text-saffron" />
          <span className="min-w-0 flex-1">This file seems to contain a password or key, so it was held back.</span>
          {/* confirm=1 is the route's "I know": the person chose to take it anyway */}
          <a aria-label={`Download anyway: ${file.name}`} className={pill} href={`${url}?confirm=1`} download>
            Download anyway
          </a>
        </div>
      )}
    </li>
  );
}
