/**
 * Credential detectors, shared by the write guard (a Write is refused) and the output scan (a file is quarantined).
 * Code, not a model: a key has a shape, and a shape is checked the same way every time, in microseconds, with no
 * provider to be down. Each detector is one regular expression plus, where the shape alone is too loose, a small
 * check on the value.
 */

export type CredentialHit = { label: string; line: number };

type Detector = { label: string; pattern: RegExp; accept?: (match: RegExpExecArray) => boolean };

const hasLetterAndDigit = (s: string) => /[A-Za-z]/.test(s) && /\d/.test(s);

// Most specific first: a later hit overlapping an earlier one is the same credential seen twice, so
// `OPENAI_API_KEY=sk-...` is reported as the API key, not as a password assignment around it.
const DETECTORS: Detector[] = [
  { label: "a private key", pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g }, // RSA, EC, OPENSSH, ENCRYPTED; never PUBLIC or CERTIFICATE
  { label: "an AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  // sk-, sk-ant-, sk-proj-, sk-or-v1-: a real key is long and random, so it always holds a digit; "sk-learn-..." does not
  { label: "an API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, accept: (m) => /\d/.test(m[0].slice(3)) },
  { label: "a GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}/g },
  { label: "a Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  // header.payload.signature, where header and payload are base64 of JSON and so both start with eyJ ("{"")
  { label: "a JSON web token", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  {
    label: "a password",
    // password=..., "db_password": "...", client_secret: ... The value must not start like a placeholder
    // (${VAR}, <your password>, ****) and must be long; group 1 is the value.
    pattern: /(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|private[_-]?key)["']?\s*[:=]\s*["']?([^\s"'`<{$*%][^\s"',;&]{11,})/gi,
    // "your-api-key-goes-here" is words; a real secret mixes letters and digits
    accept: (m) => hasLetterAndDigit(m[1]),
  },
];

const lineAt = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Every credential in the text, in order of position, each with a plain label and its 1-based line. */
export function findCredentials(text: string): CredentialHit[] {
  const spans: { start: number; end: number; label: string }[] = [];
  for (const d of DETECTORS) {
    for (const m of text.matchAll(d.pattern)) {
      if (d.accept && !d.accept(m)) continue;
      const start = m.index;
      const end = start + m[0].length;
      if (spans.some((s) => start < s.end && end > s.start)) continue; // already found by a more specific detector
      spans.push({ start, end, label: d.label });
    }
  }
  return spans.sort((a, b) => a.start - b.start).map((s) => ({ label: s.label, line: lineAt(text, s.start) }));
}
