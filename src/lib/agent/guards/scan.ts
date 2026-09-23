import type { ScanOutput } from "@/contracts/guard";
import type { FileFlag } from "@/contracts/run";
import { findCredentials } from "./credentials";
import { countCards, countEmails, countIbans, countPhones } from "./personal-data";

/**
 * The output scan, run on every file before it is stored. A credential quarantines the file (shown with a warning,
 * downloaded only after a confirm): the write guard stops the Write tool, but the output tools write files too,
 * and this is the last look before a person can download it. Personal data is counted, never refused.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// One line per kind, in the order the file card lists them.
const PERSONAL: { kind: FileFlag["kind"]; count: (text: string) => number; one: string; many: string }[] = [
  { kind: "email", count: countEmails, one: "email address", many: "email addresses" },
  { kind: "phone", count: countPhones, one: "phone number", many: "phone numbers" },
  { kind: "card", count: countCards, one: "payment card number", many: "payment card numbers" },
  { kind: "iban", count: countIbans, one: "IBAN", many: "IBANs" },
];

export const scanOutput: ScanOutput = (file) => {
  // A base64 file (.xlsx) is a zip archive: its cells are compressed, so a text pattern would see only noise.
  // Not scanned; its cells came from the agent's make_spreadsheet call, which is in the run's trace.
  if (file.encoding === "base64") return { flags: [], quarantined: false };

  const flags: FileFlag[] = [];
  const credentials = findCredentials(file.content);
  if (credentials.length > 0) {
    const [first] = credentials;
    const where = `${first.label} on line ${first.line}`;
    flags.push({
      kind: "credential",
      count: credentials.length,
      detail: credentials.length === 1 ? where : `${credentials.length} credentials, the first ${where}`,
    });
  }
  for (const p of PERSONAL) {
    const n = p.count(file.content);
    if (n > 0) flags.push({ kind: p.kind, count: n, detail: plural(n, p.one, p.many) });
  }
  return { flags, quarantined: credentials.length > 0 };
};
