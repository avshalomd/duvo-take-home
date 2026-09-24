/** A paid model call refused by its limit or by the day's money (QA F18): written for the person, shown as it is. */
export class SpendLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendLimitError";
  }
}
