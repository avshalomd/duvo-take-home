// What a failed Server Action is allowed to say to the browser. It lives beside the actions rather than inside
// them because a "use server" file may only export async functions - and this one is worth testing on its own.
export function readable(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
