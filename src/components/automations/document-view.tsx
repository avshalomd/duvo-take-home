import type { Automation } from "@/contracts/automation";
import { BriefText } from "./brief-text";
import { SECTION, SMALL } from "./surfaces";

// The automation read as a document on paper: the brief with the input drawn as a token, what it makes and the
// steps as lists. Only what the agent is told is here; how to call it sits above, in the page's header.
export function DocumentView({ automation: a }: { automation: Automation }) {
  const t = a.template;
  return (
    <div className="space-y-8">
      <section aria-labelledby="doc-brief" className="space-y-2">
        <h2 id="doc-brief" className={SECTION}>
          The brief
        </h2>
        <p data-testid="brief" className="max-w-[66ch] text-[17px] leading-[1.65] text-graphite">
          <BriefText text={t.instructions} inputLabel={a.inputLabel} />
        </p>
      </section>

      <section aria-labelledby="doc-makes" className="space-y-2">
        <h2 id="doc-makes" className={SECTION}>
          What it makes
        </h2>
        <ul className="max-w-[66ch] space-y-1.5">
          {t.expectedOutputs.map((o, i) => (
            <li key={i} className="flex gap-3 leading-6">
              <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-graphite/40" />
              <BriefText text={o} inputLabel={a.inputLabel} />
            </li>
          ))}
        </ul>
        {t.outputFormat && <p className={`${SMALL} max-w-[66ch]`}>The same every time: {t.outputFormat}</p>}
      </section>

      <section aria-labelledby="doc-steps" className="space-y-2">
        <h2 id="doc-steps" className={SECTION}>
          Steps
        </h2>
        <ol className="max-w-[66ch] space-y-1.5">
          {t.steps.map((s, i) => (
            <li key={i} className="flex gap-3 leading-6">
              <span aria-hidden className="w-5 shrink-0 text-right text-slate tabular-nums">
                {i + 1}
              </span>
              <BriefText text={s} inputLabel={a.inputLabel} />
            </li>
          ))}
        </ol>
      </section>

      {t.connections.length > 0 && (
        <p className="text-slate">
          Uses {t.connections.join(" and ")}, which must be on in Settings.
        </p>
      )}
    </div>
  );
}
