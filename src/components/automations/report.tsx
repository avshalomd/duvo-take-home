import type { Block, Inline } from "./markdown";
import { parseMarkdown } from "./markdown";

// The agent writes markdown; the person reading it should see prose. The parsing is in markdown.ts and tested;
// this only maps blocks to elements, which is why there is no library here.
export function Report({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) return null;

  return (
    <div data-testid="report" className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === "heading")
    return (
      <p className="mt-3 text-sm font-semibold">
        <Spans spans={block.spans} />
      </p>
    );
  if (block.kind === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List className={`ml-4 space-y-1 ${block.ordered ? "list-decimal" : "list-disc"}`}>
        {block.items.map((item, i) => (
          <li key={i}>
            <Spans spans={item} />
          </li>
        ))}
      </List>
    );
  }
  return (
    <p>
      <Spans spans={block.spans} />
    </p>
  );
}

function Spans({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((span, i) => {
        if (span.href)
          return (
            // the agent's sources are worth following, but never in this tab: a report is read, then its links opened
            <a key={i} href={span.href} target="_blank" rel="noreferrer" className="text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
              {span.text}
            </a>
          );
        if (span.bold)
          return (
            <strong key={i} className="font-semibold">
              {span.text}
            </strong>
          );
        if (span.code)
          return (
            <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">
              {span.text}
            </code>
          );
        return <span key={i}>{span.text}</span>;
      })}
    </>
  );
}
