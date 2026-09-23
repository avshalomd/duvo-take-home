import type { Check } from "@/contracts/eval";

// One failed check turned into one instruction for the agent: what is wrong, in which file, and what to do about it.
// Each case reads the detail its check writes (checks.ts, output-checks.ts, template-checks.ts); feedback.test.ts
// produces every one of them through the real checks, so a change in a check's wording shows up there.

export function adviceFor(check: Check): string {
  const d = check.detail;
  const file = d.match(/^([\w.-]+\.(?:csv|md|txt|svg|xlsx))\b/)?.[1] ?? "the file";
  const rest = d.replace(/^[\w.-]+\.(?:csv|md|txt|svg|xlsx):\s*/, ""); // the detail without its "file: " prefix
  switch (check.id) {
    case "completed":
      return `The run stopped before it finished (${rest.replace(/^run status \w+ - /, "")}). Finish what is left of the task.`;
    case "connection_used": {
      const name = check.label.match(/^The (.+) connection was used$/)?.[1] ?? "named";
      const tools = d.match(/no (mcp__[\w-]+?)__ tool call/)?.[1];
      return `The instructions say to use the ${name} connection, and it was never used: get the information through its tools${tools ? ` (${tools}__...)` : ""}, not from the web.`;
    }
    case "file_expected":
      return "The instructions ask for a file and none was written: write it, with the name and format they give.";
    case "extension":
      return `${d.replace(/^not allowed: /, "")}: the app keeps only .md, .txt and .csv files you write, and charts and spreadsheets made with their tools. Write the content in one of those.`;
    case "content":
      return `${file} is empty: write its content.`;
    case "parses":
      return parsesAdvice(file, rest);
    case "rows": {
      const short = rest.match(/^(\d+) rows, at least (\d+) asked for/);
      if (short) return `${file} has ${short[1]} ${short[1] === "1" ? "row" : "rows"}; the instructions ask for at least ${short[2]}: add rows until there are at least ${short[2]}.`;
      return `${file} has a header and no rows: add the rows the instructions ask for.`;
    }
    case "columns":
      return `${file} is missing the columns the instructions name (${rest.replace(/^missing columns: /, "")}): write its header with exactly those names, and the rows under them.`;
    case "urls":
      return `In ${file}, the url column holds values that are not links (${rest.replace(/^not a url: /, "")}): put each item's full https:// address there.`;
    case "duplicates": {
      const [, rows, distinct, what] = rest.match(/^(\d+) rows, (\d+) (distinct \w+)/) ?? [];
      return `${file} repeats itself${rows ? `: ${rows} rows but only ${distinct} ${what}` : ""}. List each item once, and find other items if more rows are needed.`;
    }
    case "freshness": {
      const days = check.label.match(/last (\d+) days/)?.[1] ?? "7";
      return `In ${file}, ${rest.split(";")[0]}: replace them with items published in the last ${days} days, each with its date.`;
    }
    case "chart":
      return `${file} is not a readable chart (${rest}): draw it again with the chart tool, with a title.`;
    case "spreadsheet":
      return `${file} is not a readable spreadsheet (${rest.split(" - ")[0].replace(/^[\w.-]+\.xlsx /, "")}): make it again with the spreadsheet tool.`;
    case "template_outputs": {
      const [missing, wrote] = d.replace(/^not written: /, "").split("; the run wrote ");
      return `The saved automation promises ${missing}, which was not written: write it${wrote ? ` (the run wrote ${wrote})` : ""}.`;
    }
    case "template_steps":
      return `The saved automation's steps were not all kept (${d}): put every step in the plan and do it, or mark it skipped and say why.`;
    default:
      return `${check.label} - not so: ${d}. Fix it.`; // a check added later still reaches the agent, if less well put
  }
}

// Q148: "without adding any quotes" and a value with a comma cannot both hold, and a file that cannot be read is worth
// nothing - so the valid file wins and the report says why. This advice cannot see the instructions (the feedback is
// built from the verdict alone), so it states the rule for the agent, which can.
const QUOTE_CONFLICT =
  "If the instructions say not to use quotes, keep the file valid (quote the value) and say in the report that the instruction could not be followed for that value, and why.";

// A ragged row is the common CSV failure (his run, 2026-09-23): a comma inside an unquoted value shifts every cell
// after it. More values than the header means exactly that; fewer means a value was left out.
function parsesAdvice(file: string, rest: string): string {
  const ragged = rest.match(/^row (\d+) has (\d+) fields, the header has (\d+)(?: \(and (\d+) more)?/);
  if (!ragged) {
    return `${file} is not valid CSV (${rest}): put every value that contains a comma or a quote in double quotes, double any quote inside a value, and write ${file} again. ${QUOTE_CONFLICT}`;
  }
  const [, row, got, want, more] = ragged;
  const also = more ? ` ${more} more ${more === "1" ? "row has" : "rows have"} the same problem.` : "";
  if (Number(got) > Number(want)) {
    return `In ${file}, row ${row} has ${got} values but the header has ${want}: a value that contains a comma is not in double quotes.${also} Put every value that contains a comma in double quotes and write ${file} again. ${QUOTE_CONFLICT}`;
  }
  return `In ${file}, row ${row} has ${got} values but the header has ${want}: a value is missing.${also} Give every row a value for every column (nothing between two commas when there is none) and write ${file} again.`;
}
