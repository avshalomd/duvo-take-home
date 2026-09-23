"use client";

import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FIELD } from "./surfaces";

// An editable list (the steps, the outputs): one input per row, each sent as its own field with the same name, so
// the form parser reads a row per field. Rows are added and removed here; their text stays in the inputs.
export function ListField({
  name,
  label,
  initial,
  addLabel,
  numbered,
  error,
}: {
  name: string;
  label: string;
  initial: string[];
  addLabel: string;
  numbered?: boolean;
  error?: string;
}) {
  const next = useRef(Math.max(initial.length, 1)); // past the ids the first rows take (one empty row when there are none)
  // ids, not indexes, as keys: removing row 2 must not hand row 3's text to row 2's input
  const [rows, setRows] = useState(() => (initial.length ? initial : [""]).map((text, id) => ({ id, text })));

  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-2 text-[13px] font-medium tracking-[0.01em] text-slate">{label}</legend>
      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={row.id} className="flex items-center gap-2">
            {numbered && (
              <span aria-hidden className="w-5 shrink-0 text-right text-slate tabular-nums">
                {i + 1}
              </span>
            )}
            <Input
              name={name}
              defaultValue={row.text}
              aria-label={`${label}, row ${i + 1}`}
              aria-invalid={Boolean(error) || undefined}
              className={cn(FIELD, "flex-1")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove row ${i + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
              className="text-slate"
            >
              <X />
            </Button>
          </li>
        ))}
      </ol>
      <Button type="button" variant="ghost" size="sm" className="text-slate" onClick={() => setRows((r) => [...r, { id: next.current++, text: "" }])}>
        <Plus /> {addLabel}
      </Button>
      {error && (
        <p id={`${name}-error`} role="alert" className="text-[13px] text-crimson">
          {error}
        </p>
      )}
    </fieldset>
  );
}
