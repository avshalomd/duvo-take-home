import { z } from "zod";
import { ConnectionEdit, NewConnection } from "@/contracts/connection";

// Beside the actions rather than inside them: a "use server" file may only export async functions, and the parse is
// worth testing on its own.

export type ConnectionFormResult<T> =
  | { ok: true; input: T }
  | { ok: false; fieldErrors: Record<string, string[] | undefined>; values: Record<string, string> };

const AUTH_TYPES = ["none", "bearer", "oauth"] as const;

/**
 * The Add and Edit forms of a connection, as posted. The contract's own messages are already sentences, so they are
 * shown as they are; the one rule the contract cannot know is that "a token" needs a token when adding.
 */
export function parseConnectionForm(form: FormData, mode: "add"): ConnectionFormResult<NewConnection>;
export function parseConnectionForm(form: FormData, mode: "edit"): ConnectionFormResult<ConnectionEdit>;
export function parseConnectionForm(form: FormData, mode: "add" | "edit"): ConnectionFormResult<NewConnection | ConnectionEdit> {
  const text = (name: string) => String(form.get(name) ?? "");
  const authType = AUTH_TYPES.find((a) => a === text("authType")) ?? "none"; // a missing or unknown choice reads as no sign-in
  // The token is never in `values`: a refused form is sent back to the browser, and a secret does not travel back.
  const values = { name: text("name"), url: text("url"), transport: text("transport") || "http", authType };
  const token = authType === "bearer" ? text("token").trim() : ""; // a token left in a hidden field is not a choice the user made

  const parsed =
    mode === "add"
      ? NewConnection.safeParse({ ...values, token: token || undefined })
      : ConnectionEdit.safeParse({ ...values, token: token || undefined, clearToken: form.get("clearToken") === "on" });

  const fieldErrors: Record<string, string[] | undefined> = parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;
  // editing may leave the field empty to keep the saved token; adding has nothing saved to keep
  if (mode === "add" && authType === "bearer" && !token) fieldErrors.token = ["Paste the token, or choose \"No sign-in\" if the server needs none."];

  if (!parsed.success || fieldErrors.token) return { ok: false, fieldErrors, values };
  return { ok: true, input: parsed.data };
}
