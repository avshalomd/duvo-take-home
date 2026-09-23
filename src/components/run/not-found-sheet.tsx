import Link from "next/link";

// A link to a run that is gone, or belongs to another workspace (which reads as missing, never as forbidden).
export function NotFoundSheet() {
  return (
    <section className="mx-auto flex max-w-[52rem] flex-col items-center gap-3 rounded-[22px] bg-paper px-6 py-20 text-center shadow-sheet">
      <h1 className="display text-[28px]">That run was not found</h1>
      <p className="text-[15px] text-slate">It may have been deleted, or it belongs to another workspace.</p>
      <Link href="/" className="mt-2 text-[15px] font-medium underline underline-offset-2">
        Start a new run
      </Link>
    </section>
  );
}
