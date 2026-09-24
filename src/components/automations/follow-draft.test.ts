import { describe, expect, it, vi } from "vitest";
import { followDraft } from "./follow-draft";

const handlers = () => ({ open: vi.fn(), fail: vi.fn() });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("the drafting page waiting for its draft", () => {
  it("opens the draft when it is ready while the page is still open", async () => {
    const on = handlers();
    followDraft(Promise.resolve({ id: "a1" }), on);
    await settle();
    expect(on.open).toHaveBeenCalledWith("a1");
  });

  it("says why when the draft could not be made", async () => {
    const on = handlers();
    followDraft(Promise.resolve({ error: "The model is busy." }), on);
    await settle();
    expect(on.fail).toHaveBeenCalledWith("The model is busy.");
  });

  it("asks to check the connection when the request itself failed", async () => {
    const on = handlers();
    followDraft(Promise.reject(new Error("Failed to fetch")), on);
    await settle();
    expect(on.fail).toHaveBeenCalledWith("The draft could not be made. Check your connection and try again.");
  });

  // Review (frontend): someone who left during the half-minute draft was pulled onto the new draft's page later
  it("does nothing once the person has left the page, whether the draft is ready or failed", async () => {
    const ready = handlers();
    followDraft(Promise.resolve({ id: "a1" }), ready)();
    const failed = handlers();
    followDraft(Promise.reject(new Error("Failed to fetch")), failed)();
    await settle();
    expect(ready.open).not.toHaveBeenCalled();
    expect(failed.fail).not.toHaveBeenCalled();
  });
});
