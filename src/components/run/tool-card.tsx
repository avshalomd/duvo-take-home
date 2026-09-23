"use client";

import { useState } from "react";
import type { RunEvent } from "@/contracts/run";
import { cn } from "@/lib/utils";
import { relativeToRun, toolKind, toolLine } from "./format";
import { LocalTime } from "./local-time";

// The kind of each call as a small label, from the palette's tokens so it reads in both themes (Q104: the old
// sky-700 on sky-600/10 all but vanished in dark mode). Writing is what makes a deliverable, so it is the green one.
const kindStyle: Record<string, string> = {
  search: "bg-mist text-slate",
  fetch: "bg-mist text-slate",
  read: "bg-mist text-slate",
  write: "bg-fern-wash text-fern",
  connection: "bg-saffron-wash text-[color-mix(in_oklab,var(--saffron),var(--graphite)_40%)]",
  tool: "bg-mist text-slate",
};

// One tool call and its result as a single card: the call is the headline, the result is the evidence under it,
// clamped to two lines because a preview is 300 characters and only the first line is usually read.
export function ToolCard({
  call,
  result,
  connections,
  folders = [],
  over = false,
}: {
  call: Extract<RunEvent, { kind: "tool_call" }>;
  result?: Extract<RunEvent, { kind: "tool_result" }>;
  connections: { name: string }[];
  folders?: string[]; // the run's working folder: paths in the result are shown relative to it (Q187)
  over?: boolean; // the run has ended: a call with no result is no longer waiting for one
}) {
  const [open, setOpen] = useState(false);
  const kind = toolKind(call.payload.name);
  const preview = result ? relativeToRun(result.payload.preview, folders) : "";

  return (
    <div className="rounded-[12px] bg-mist/60 px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <span className={cn("shrink-0 rounded-full px-2 text-[11px] font-medium", kindStyle[kind])}>
          {kind}
        </span>
        <span className="min-w-0 flex-1 font-mono text-xs break-words">
          {toolLine(call.payload.name, call.payload.input, connections)}
        </span>
        <LocalTime iso={call.at} className="shrink-0 font-mono text-[10px] text-slate" />
      </div>

      {result && (
        <div className="mt-1 pl-2">
          <p
            className={cn(
              "font-mono text-[11px] whitespace-pre-wrap",
              result.payload.is_error ? "text-crimson" : "text-slate",
              !open && "line-clamp-2",
            )}
          >
            {preview}
          </p>
          {preview.length > 120 && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="mt-0.5 text-[11px] text-slate underline underline-offset-2"
            >
              {open ? "less" : "more"}
            </button>
          )}
        </div>
      )}
      {!result && (
        <p className="mt-1 pl-2 text-[11px] text-slate">{over ? "no result: the run ended before this call answered" : "waiting for the result..."}</p>
      )}
    </div>
  );
}
