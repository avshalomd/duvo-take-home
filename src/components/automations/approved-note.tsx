"use client";

import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { CommandChip } from "./brief-text";

// The small confirmation right after Approve: the check pops in with the thread's finished-step spring, the one
// bounce on this page, because it answers the person's own action. Under reduced motion it only fades in.
export function ApprovedNote({ command }: { command: string }) {
  const reduce = useReducedMotion();
  return (
    <p role="status" className="flex items-center gap-3 rounded-[16px] bg-fern-wash px-4 py-3 text-[15px] text-graphite">
      <motion.span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fern text-white"
        initial={reduce ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0.35, duration: 0.45 }}
      >
        <Check strokeWidth={3} className="size-4" />
      </motion.span>
      <span>
        Approved. It is ready: type <CommandChip command={command} /> on Home, or run it here.
      </span>
    </p>
  );
}
