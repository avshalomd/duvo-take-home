import { briefParts } from "@/lib/automations/brief";
import { cn } from "@/lib/utils";

/** Where the input goes, drawn as a token with the input's name in it ("Company name") instead of "{input}". */
export function InputToken({ label }: { label: string }) {
  return (
    <span
      data-testid="input-token"
      className="mx-0.5 inline-flex items-baseline rounded-full bg-muted px-2 text-[0.92em] font-medium text-graphite ring-1 ring-inset ring-hairline"
    >
      {label}
    </span>
  );
}

/** Text from the template - the brief, a step, an output - with every {input} drawn as the input's token (Q118). */
export function BriefText({ text, inputLabel, className }: { text: string; inputLabel: string; className?: string }) {
  return (
    <span className={className}>
      {briefParts(text).map((part, i) => (part.kind === "input" ? <InputToken key={i} label={inputLabel} /> : <span key={i}>{part.text}</span>))}
    </span>
  );
}

/** A command as people type it, "\audit Apple Inc.", in running text: the system font, set apart as a quiet chip. */
export function CommandChip({ command, input, className }: { command: string; input?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline rounded-full bg-muted px-2 font-semibold whitespace-nowrap text-graphite", className)}>
      \{command}
      {input ? <span className="ml-1 font-normal">{input}</span> : null}
    </span>
  );
}
