"use client";

import { Check } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { CommandChip } from "./brief-text";

// The small confirmation right after Approve: the check pops in with the thread's finished-step spring, the one
// bounce on this page, because it answers the person's own action.
// Reduced motion: MotionConfig drops the scale and keeps a 150 ms fade. The starting style stays the same for
// everyone - choosing it from useReducedMotion() made the server's HTML differ from a reduced-motion browser's.
export function ApprovedNote({ command }: { command: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <p role="status" className="flex items-center gap-3 rounded-[16px] bg-fern-wash px-4 py-3 text-[15px] text-graphite">
        <motion.span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fern text-white"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.35, duration: 0.45, opacity: { duration: 0.15 } }}
        >
          <Check strokeWidth={3} className="size-4" />
        </motion.span>
        <span>
          Approved. It is ready: type <CommandChip command={command} /> on Home, or run it here.
        </span>
      </p>
    </MotionConfig>
  );
}
