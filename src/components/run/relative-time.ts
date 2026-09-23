// "2 min ago" is how a list of runs is read; the exact clock time stays in the timeline.
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return ""; // a date we cannot read is shown as nothing, never as "NaN min ago"

  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000)); // max 0: a server clock ahead of the browser must not read as the future
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
