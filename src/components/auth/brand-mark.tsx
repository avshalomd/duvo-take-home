// The product's mark on the pages before sign-in: a tiny thread on an ink tile - two steps done, the bead on the
// third - the same picture as the plan on every run.
export function BrandMark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden className="flex size-8 items-center justify-center rounded-[10px] bg-graphite shadow-tile">
        <svg viewBox="0 0 20 20" className="size-5">
          <line x1="10" y1="4" x2="10" y2="16" stroke="var(--paper)" strokeOpacity="0.3" strokeWidth="1.6" />
          <line x1="10" y1="4" x2="10" y2="10" stroke="var(--saffron)" strokeWidth="1.6" />
          <circle cx="10" cy="4" r="1.9" fill="var(--saffron)" />
          <circle cx="10" cy="10" r="2.9" fill="var(--saffron)" />
          <circle cx="10" cy="16" r="1.9" fill="none" stroke="var(--paper)" strokeOpacity="0.55" strokeWidth="1.2" />
        </svg>
      </span>
      <span className="display text-[19px]">Automations</span>
    </span>
  );
}
