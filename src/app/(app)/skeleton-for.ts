/** Which page's shape the app's loading boundary draws (loading.tsx), read from the address being opened. */
export type SkeletonKind = "home" | "gallery" | "new-automation" | "automation" | "settings" | "none";

// Pure, so the choice is tested without a router. "none" rather than a guess: a wrong shape jumps when the page lands.
export function skeletonFor(path: string): SkeletonKind {
  if (path === "/") return "home";
  if (path === "/automations") return "gallery";
  if (path === "/automations/new") return "new-automation";
  if (path.startsWith("/automations/")) return "automation";
  if (path === "/settings" || path.startsWith("/settings/")) return "settings";
  return "none";
}
