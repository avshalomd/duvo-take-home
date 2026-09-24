// Pure: the name and the URL slug of the workspace every new account gets.

/** "Avshalom Dayan" -> "Avshalom's workspace"; no name -> "My workspace". */
export function personalWorkspaceName(name: string): string {
  const suffix = "'s workspace";
  const first = name.trim().split(/\s+/)[0].slice(0, 60 - suffix.length); // a workspace's name is at most 60 characters (F21)
  return first ? `${first}${suffix}` : "My workspace";
}

/**
 * True for the workspace an account gets at sign-up (security review S11). Nothing else marks it: its slug ends with
 * the first six characters of its own id (createPersonalWorkspace), while the new-workspace form gives a random
 * suffix, and Better Auth, not the form, makes that workspace's id - so a made workspace matches by chance only.
 */
export function isPersonalWorkspace(workspace: { id: string; slug: string }): boolean {
  return workspace.slug.endsWith(`-${workspace.id.slice(0, 6)}`);
}

/**
 * A slug for the organization row, which Better Auth requires to be unique: the name made URL-safe plus a random
 * suffix the caller passes in (random here would make the function untestable).
 */
export function workspaceSlug(name: string, suffix: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // "ë" -> "e": drop the accents NFKD split off
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/, "");
  return `${base || "workspace"}-${suffix}`;
}
