"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

// One place for how Settings moves: a critically damped spring (docs/DESIGN-V2.md, "Motion"), and "user" so that a
// person who asked for reduced motion gets no movement in space - only the opacity changes, as a cross-fade.
export const SPRING = { type: "spring" as const, bounce: 0, duration: 0.35 };

export function SettingsMotion({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      {children}
    </MotionConfig>
  );
}
