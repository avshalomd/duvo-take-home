import { startTransition, type FormEvent } from "react";

/**
 * Called from a form's onSubmit: runs a useActionState action without React 19's automatic form reset. The reset
 * would put radios back to their first choice, empty a pasted token and blank what was typed when the server
 * refuses it; this way the fields simply keep what the person entered (CLAUDE.md, "Forms").
 */
export function submitKeepingValues(e: FormEvent<HTMLFormElement>, action: (data: FormData) => void): void {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  startTransition(() => action(data)); // an action from useActionState must be called inside a transition
}
