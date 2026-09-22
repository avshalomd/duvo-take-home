"use client";

import { useState } from "react";
import type { RunEvent } from "@/contracts/run";
import { cn } from "@/lib/utils";
import { toolKind, toolLine } from "./format";
import { LocalTime } from "./local-time";

const kindStyle: Record<string, string> = {
  search: "border-sky-600/30 bg-sky-600/10 text-sky-700",
  fetch: "border-violet-600/30 bg-violet-600/10 text-violet-700",
  write: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700",
  connection: "border-amber-600/30 bg-amber-600/10 text-amber-700",
  tool: "border-zinc-400/30 bg-zinc-400/10 text-zinc-600",
};

// One tool call and its result as a single card: the call is the headline, the result is the evidence under it,
// clamped to two lines because a preview is 300 characters and only the first line is usually read.
export function ToolCard({
  call,
  result,
  connections,
}: {
  call: Extract<RunEvent, { kind: "tool_call" }>;
  result?: Extract<RunEvent, { kind: "tool_result" }>;
  connections: { name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const kind = toolKind(call.payload.name);

  return (
    <div className="rounded-md border bg-background px-2 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className={cn("shrink-0 rounded border px-1 text-[10px] tracking-wide uppercase", kindStyle[kind])}>
          {kind}
        </span>
        <span className="min-w-0 flex-1 font-mono text-xs break-words">
          {toolLine(call.payload.name, call.payload.input, connections)}
        </span>
        <LocalTime iso={call.at} className="shrink-0 font-mono text-[10px] text-muted-foreground" />
      </div>

      {result && (
        <div className="mt-1 pl-2">
          <p
            className={cn(
              "font-mono text-[11px] whitespace-pre-wrap",
              result.payload.is_error ? "text-red-600" : "text-muted-foreground",
              !open && "line-clamp-2",
            )}
          >
            {result.payload.preview}
          </p>
          {result.payload.preview.length > 120 && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="mt-0.5 text-[11px] text-muted-foreground underline underline-offset-2"
            >
              {open ? "less" : "more"}
            </button>
          )}
        </div>
      )}
      {!result && <p className="mt-1 pl-2 text-[11px] text-muted-foreground">waiting for the result...</p>}
    </div>
  );
}
