import { describe, expect, it } from "vitest";
import { signUpWords } from "./sign-up-words";

describe("signUpWords - what the sign-up page says", () => {
  it("offers a workspace of one's own to someone who came on their own", () => {
    expect(signUpWords(null)).toEqual({
      title: "Create an account",
      description: "You get a workspace of your own. Nobody else sees what you run in it.",
    });
  });

  // UX QA U4: reached from an invitation, the page promised a private workspace and never named the one they were joining.
  // U26: the account joins straight after sign-up, so the words promise that, not a second step
  it("names the workspace and who invited them, and says the account joins it at once", () => {
    expect(signUpWords({ workspaceName: "Demo workspace", inviterName: "Olga Owner" })).toEqual({
      title: "Create an account to join Demo workspace",
      description: "Olga Owner invited you to work together in Demo workspace. Your account joins it as soon as it is made.",
    });
  });
});
