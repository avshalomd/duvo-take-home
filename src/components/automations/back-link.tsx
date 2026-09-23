import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LINK } from "./surfaces";

// Back to the gallery, as a quiet link with a chevron (the back affordance people know from their phone).
export function BackLink() {
  return (
    <Link href="/automations" className={cn(LINK, "inline-flex items-center gap-0.5 text-[15px] no-underline")}>
      <ChevronLeft aria-hidden className="size-4" />
      Automations
    </Link>
  );
}
