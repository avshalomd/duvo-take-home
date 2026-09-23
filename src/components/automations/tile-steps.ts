const MAX = 4; // four steps read at a glance, and keep the gallery's tiles close to one height

/** The steps a gallery tile draws as its mini thread, and how many are left out ("and 2 more steps"). */
export function tileSteps(steps: string[]): { shown: string[]; more: number } {
  return { shown: steps.slice(0, MAX), more: Math.max(0, steps.length - MAX) };
}
