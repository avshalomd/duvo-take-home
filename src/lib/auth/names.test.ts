import { describe, expect, it } from "vitest";
import { NUL_REFUSED } from "@/contracts/text";
import { friendlyAuthError } from "./errors";
import { MAX_USER_NAME, MAX_WORKSPACE_NAME, userNameRefusal, workspaceNameRefusal } from "./names";
import { personalWorkspaceName } from "./workspace-name";

// QA F1 and F21: Better Auth stored a person's name as sent - a 5,005-character one, which then named a 5,017-character
// workspace, and a NUL character, which Postgres refused with a 500. The app's forms cap the name at 80 (sign-up) and a
// workspace at 60; these rules hold whichever way the name arrives.
describe("userNameRefusal", () => {
  it("lets a name up to the sign-up form's 80 characters through", () => {
    expect(MAX_USER_NAME).toBe(80);
    expect(userNameRefusal("Avshalom Dayan")).toBeNull();
    expect(userNameRefusal("N".repeat(80))).toBeNull();
  });

  it("refuses a longer name, with a code the sign-up form turns into a sentence", () => {
    const refusal = userNameRefusal("N".repeat(81));
    expect(refusal?.code).toBe("NAME_TOO_LONG");
    expect(friendlyAuthError({ code: refusal!.code })).toBe("Keep your name under 80 characters.");
  });

  it("refuses a name with a hidden NUL character, in the same plain words as every other text", () => {
    const refusal = userNameRefusal("Ann\u0000 Other");
    expect(refusal?.code).toBe("NAME_HIDDEN_CHARACTER");
    expect(friendlyAuthError({ code: refusal!.code })).toBe(NUL_REFUSED);
  });
});

describe("workspaceNameRefusal", () => {
  it("holds the new-workspace form's limit of 60 characters and refuses a NUL character", () => {
    expect(MAX_WORKSPACE_NAME).toBe(60);
    expect(workspaceNameRefusal("W".repeat(60))).toBeNull();
    expect(workspaceNameRefusal("W".repeat(61))?.message).toBe("Keep the workspace's name under 60 characters.");
    expect(workspaceNameRefusal("Fin\u0000ance")?.message).toBe(NUL_REFUSED);
  });
});

describe("personalWorkspaceName keeps to the workspace limit", () => {
  it("shortens a long first name so the workspace's name is at most 60 characters", () => {
    const name = personalWorkspaceName("A".repeat(80));
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name.endsWith("'s workspace")).toBe(true);
  });
});
