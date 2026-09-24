import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/auth/brand-mark";

// absolute: the root layout's title template is for the segments under it, not for this page beside it
export const metadata: Metadata = { title: { absolute: "Not found - Handover" } };

// Any address the app does not have (Q201: it showed Next's bare 404, with no way back). It renders inside the root
// layout only - the app's top bar needs a signed-in workspace, and this page may be reached without one - so it
// carries the mark and one plain sheet on the mist, the same look as a run that was not found, and one way out.
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col px-6 pt-7 pb-12 sm:px-10">
      <Link href="/" aria-label="Handover, home" className="w-fit rounded-[12px] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
        <BrandMark />
      </Link>
      <main className="my-auto flex justify-center py-10">
        <section className="flex w-full max-w-[40rem] flex-col items-center gap-3 rounded-[22px] bg-paper px-6 py-20 text-center shadow-sheet">
          <h1 className="display text-[28px]">This page was not found</h1>
          <p className="text-[15px] text-slate">The address may be mistyped, or the page has moved.</p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center rounded-full bg-graphite px-5 text-[15px] font-medium text-paper transition-transform duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.97]"
          >
            Back to Home
          </Link>
        </section>
      </main>
    </div>
  );
}
