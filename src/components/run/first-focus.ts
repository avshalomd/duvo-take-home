type FocusDoc = Pick<Document, "activeElement" | "body" | "querySelector">;

export function mayTakeFocus(doc: FocusDoc): boolean {
  void doc; // written in the next commit
  return true;
}
