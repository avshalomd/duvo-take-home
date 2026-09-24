import { describe, expect, it } from "vitest";
import { withoutTestTag } from "./test-tag";

// qa-ai F13: QA names its runs "[e2e] ..." so it can find and delete them, and the agent read the tag as the subject
// of an ambiguous brief ("e2e" -> a list of end-to-end testing tools). The tag stays on the stored run; the agent and
// the judges never see it.
describe("withoutTestTag", () => {
  it("takes a leading [e2e] tag and the space after it off the instructions", () => {
    expect(withoutTestTag("[e2e] Make me a list of the best ones for our team.")).toBe("Make me a list of the best ones for our team.");
    expect(withoutTestTag("  [E2E]   Chart the sales")).toBe("Chart the sales");
  });

  it("leaves instructions without a leading tag as they are", () => {
    expect(withoutTestTag("Make me a list of the best ones.")).toBe("Make me a list of the best ones.");
    expect(withoutTestTag("Compare our [e2e] suites")).toBe("Compare our [e2e] suites"); // only a leading tag is QA's
    expect(withoutTestTag("[e2e-report] Summarise it")).toBe("[e2e-report] Summarise it");
  });
});
