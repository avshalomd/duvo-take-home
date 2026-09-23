import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// One labelled field of the sign-in forms: 44 px tall (a thumb's target), 12 px corners, the system font at 15 px.
export function AuthField({ label, hint, id, className, ...input }: React.ComponentProps<"input"> & { label: string; hint?: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium tracking-[0.01em]">
        {label}
      </label>
      <Input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={cn("h-11 rounded-xl bg-paper px-3.5 text-[15px] md:text-[15px]", className)} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="text-[13px] tracking-[0.01em] text-slate">
          {hint}
        </p>
      )}
    </div>
  );
}

/** A link inside the sign-in screens: graphite and underlined, as every link in the app. */
export const authLink = "font-medium text-graphite underline decoration-graphite/30 underline-offset-4 hover:decoration-graphite";
