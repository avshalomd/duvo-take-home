import { Check, KeyRound, Plug, X } from "lucide-react";
import type { ConnectionTone } from "./connection-label";
import { RowGlyph } from "./grouped";

// A connection's state as the tile at the start of its row: one colour on its own wash, and the words for a screen
// reader. Colour is never the only signal: the row's line says it too when something is needed.
const GLYPH: Record<ConnectionTone, { icon: typeof Check; className: string }> = {
  ok: { icon: Check, className: "bg-fern-wash text-fern" },
  idle: { icon: Plug, className: "bg-muted text-slate" },
  warn: { icon: KeyRound, className: "bg-saffron-wash text-saffron" },
  bad: { icon: X, className: "bg-crimson-wash text-crimson" },
};

export function StatusGlyph({ tone, label }: { tone: ConnectionTone; label: string }) {
  const { icon: Icon, className } = GLYPH[tone];
  return (
    <RowGlyph className={className} label={label}>
      <Icon strokeWidth={2.25} />
    </RowGlyph>
  );
}
