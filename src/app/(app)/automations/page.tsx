import Link from "next/link";
import { CommandChip } from "@/components/automations/brief-text";
import { GalleryTile } from "@/components/automations/gallery-tile";
import { LINK, SHEET } from "@/components/automations/surfaces";
import { buttonVariants } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/session";
import { listAutomations } from "@/lib/automations/store";
import { cn } from "@/lib/utils";

// /automations: the gallery. Each automation is its command, one line and its state; the way in is a run you liked.
export default async function AutomationsPage() {
  const { workspaceId } = await requireSession();
  const automations = await listAutomations(workspaceId);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="display text-[36px] text-graphite sm:text-[44px]">Automations</h1>
          <p className="max-w-prose text-slate">Runs you liked, saved to do again on a new input.</p>
        </div>
        <Link href="/automations/new" className={cn(buttonVariants(), "h-10 px-5 text-[15px]")}>
          New from a run
        </Link>
      </header>

      {automations.length === 0 ? (
        <section className={cn(SHEET, "px-6 py-12 text-center sm:px-12 sm:py-16")}>
          <h2 className="display text-[28px] text-graphite sm:text-[36px]">Which run would you do again?</h2>
          {/* the whole flow in one sentence */}
          <p className="mx-auto mt-4 max-w-[52ch] text-[17px] leading-7 text-slate">
            Do a run on Home, save it here as an automation, check it on an example, and from then on call it with a backslash, like{" "}
            <CommandChip command="audit" input="Apple Inc." />.
          </p>
          <p className="mt-6">
            <Link href="/" className={LINK}>
              Go to Home
            </Link>
          </p>
        </section>
      ) : (
        <ul data-testid="gallery" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {automations.map((a) => (
            <li key={a.id}>
              <GalleryTile automation={a} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
