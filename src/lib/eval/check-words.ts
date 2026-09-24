import type { Check } from "@/contracts/eval";

// A failed check said as what went wrong, for the person (qa-ux U10). A check is labelled by what it asks for ("The CSV
// parses"), and "the CSV parses (in countries.csv, row 5 has 6 fields...)" read as if it parsed. Each case reads the
// detail its check writes (checks.ts, output-checks.ts, template-checks.ts); check-words.test.ts produces them through
// the real checks. The agent's own instructions for the same failures are check-advice.ts.

const FILE = /^([\w.-]+\.(?:csv|md|txt|svg|xlsx)):\s*/; // the "file: " prefix the checks put on a detail

export function failureWords(check: Pick<Check, "id" | "label" | "detail">): string {
  const d = check.detail.trim();
  const file = d.match(FILE)?.[1];
  const rest = d.replace(FILE, "");
  const the = file ?? "the CSV file";
  switch (check.id) {
    case "completed":
      return "The run stopped before it finished";
    case "connection_used": {
      const name = check.label.match(/^The (.+) connection was used$/)?.[1] ?? "named";
      return `The ${name} connection the instructions name was never used`;
    }
    case "file_expected":
      return "No file was written, though the instructions ask for one";
    case "extension":
      return `${rest.replace(/^not allowed: /, "")} is a kind of file the app does not keep`;
    case "content":
      return `${file ?? rest.replace(/ is empty$/, "")} is empty`;
    case "parses":
      // "row 5 has 6 fields" is the parser's word; a person counts values
      return `${the} could not be read as a table (${rest.replace(/\bfields\b/g, "values").replace(/\bfield count\b/g, "number of values")})`;
    case "rows": {
      const short = rest.match(/^(\d+) rows?, at least (\d+) asked for/);
      if (short) return `${the} has ${short[1]} ${short[1] === "1" ? "row" : "rows"}, and at least ${short[2]} were asked for`;
      return `${the} has no rows under its header`;
    }
    case "columns":
      return `${the} is missing the columns asked for (${rest.replace(/^missing columns: /, "")})`;
    case "urls":
      return `In ${the}, some links are not web addresses (${rest.replace(/^not a url: /, "")})`;
    case "duplicates": {
      const [, rows, distinct] = rest.match(/^(\d+) rows, (\d+) distinct/) ?? [];
      return rows ? `${the} repeats rows (only ${distinct} of its ${rows} rows ${distinct === "1" ? "is" : "are"} different)` : `${the} repeats rows`;
    }
    case "freshness":
      return `${the} has old rows (${rest.split(";")[0]})`;
    case "chart":
      return `${file ?? "The chart"} is not a readable chart (${rest})`;
    case "spreadsheet":
      return `${file ?? "The spreadsheet"} is not a readable spreadsheet`;
    case "template_outputs": {
      const [missing] = d.replace(/^not written: /, "").split("; the run wrote ");
      return `${missing}, which the automation promises, was not written`;
    }
    case "template_steps":
      return `The plan did not keep the automation's steps (${d})`;
    default:
      return `This was not met: ${lowerFirst(check.label)}${d ? ` (${d})` : ""}`; // a check added later still reads as a failure
  }
}

// A check's label -> its id, to read a stored reason ("label: detail") back as a check: older verdicts and every heal
// event keep only the reasons.
const LABELS: [RegExp, string][] = [
  [/^The run finished$/, "completed"],
  [/^The .+ connection was used$/, "connection_used"],
  [/^A file was written$/, "file_expected"],
  [/^Only text, table, chart and spreadsheet files were written$/, "extension"],
  [/^.+ has content$/, "content"],
  [/^The CSV parses$/, "parses"],
  [/^The CSV has rows$/, "rows"],
  [/^The columns the instructions named are there$/, "columns"],
  [/^The url column holds links$/, "urls"],
  [/^No row is a duplicate of another$/, "duplicates"],
  [/^The rows are from the last \d+ days$/, "freshness"],
  [/^.+ is a readable chart$/, "chart"],
  [/^.+ is a readable spreadsheet$/, "spreadsheet"],
  [/^The files the automation promises were written$/, "template_outputs"],
  [/^The plan kept the automation's steps$/, "template_steps"],
];

/** A stored reason in plain words when it is a failed check's ("The CSV parses: countries.csv: row 5..."), else null. */
export function plainCheckReason(reason: string): string | null {
  const cut = reason.indexOf(": ");
  if (cut < 0) return null;
  const label = reason.slice(0, cut);
  const id = LABELS.find(([re]) => re.test(label))?.[1];
  return id ? failureWords({ id, label, detail: reason.slice(cut + 2) }) : null;
}

const lowerFirst = (s: string) => (/^[A-Z][A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
