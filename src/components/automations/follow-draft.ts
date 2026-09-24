export type DraftResult = { id?: string; error?: string };

/**
 * Waits for a draft and hands its outcome on: open it, or say why it could not be made. The returned function is
 * "the person left": after it, a draft that arrives does nothing, so nobody is pulled onto it half a minute later.
 * The draft itself is kept either way, and the gallery lists it.
 */
export function followDraft(draft: Promise<DraftResult>, on: { open: (id: string) => void; fail: (message: string) => void }): () => void {
  let active = true;
  draft.then(
    (r) => {
      if (!active) return;
      if (r.id) on.open(r.id);
      else on.fail(r.error ?? "The draft could not be made.");
    },
    () => {
      if (active) on.fail("The draft could not be made. Check your connection and try again."); // the request itself failed
    },
  );
  return () => {
    active = false;
  };
}
