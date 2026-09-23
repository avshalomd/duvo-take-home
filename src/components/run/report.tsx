import type { Block, Inline } from "./markdown";
import { reportBlocks } from "./markdown";

// The agent writes markdown; the person reading it should see prose, at a reading width of 66 characters. The
// parsing is in markdown.ts and tested; this only maps blocks to elements, which is why there is no library here.
export function Report({ text }: { text: string }) {
  const blocks = reportBlocks(text); // without the agent's own "Report" heading: the page has one (Q144)
  if (blocks.length === 0) return null;

  return (
    <div data-testid="report" className="max-w-[66ch] space-y-3 text-[15px] leading-relaxed">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === "heading")
    return (
      <p className="pt-2 text-[15px] font-semibold">
        <Spans spans={block.spans} />
      </p>
    );
  if (block.kind === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List className={`ml-5 space-y-1 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-slate`}>
        {block.items.map((item, i) => (
          <li key={i}>
            <Spans spans={item} />
          </li>
        ))}
      </List>
    );
  }
  if (block.kind === "table")
    return (
      // a wide table scrolls inside its own frame, so the page never scrolls sideways on a phone
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px] tracking-[0.01em]">
          <thead>
            <tr className="border-b border-hairline text-left">
              {block.header.map((cell, i) => (
                <th key={i} scope="col" className="py-1.5 pr-4 font-semibold">
                  <Spans spans={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r} className="border-b border-hairline last:border-0">
                {row.map((cell, c) => (
                  <td key={c} className="py-1.5 pr-4 align-top">
                    <Spans spans={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
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
            <a key={i} href={span.href} target="_blank" rel="noreferrer" className="text-graphite underline decoration-slate/50 underline-offset-2 hover:decoration-graphite">
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
          // a tinted token in the body font, not monospace: outside Details the app speaks in one typeface (Q144).
          // font-[inherit]: the browser's and Tailwind's base styles give <code> a monospace family of its own
          return (
            <code key={i} className="rounded-md bg-mist px-1.5 py-0.5 font-[inherit] text-[0.95em] font-medium">
              {span.text}
            </code>
          );
        return <span key={i}>{span.text}</span>;
      })}
    </>
  );
}
