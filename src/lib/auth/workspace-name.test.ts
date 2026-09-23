import { describe, expect, it } from "vitest";
import { personalWorkspaceName, workspaceSlug } from "./workspace-name";

describe("personalWorkspaceName", () => {
  it("names the personal workspace after the first name", () => {
    expect(personalWorkspaceName("Avshalom Dayan")).toBe("Avshalom's workspace");
    expect(personalWorkspaceName("  Jan  ")).toBe("Jan's workspace");
  });

  it("says 'My workspace' when there is no name", () => {
    expect(personalWorkspaceName("")).toBe("My workspace");
    expect(personalWorkspaceName("   ")).toBe("My workspace");
  });
});

describe("workspaceSlug", () => {
  it("is the lower-case name with a suffix, so two people called Jan never collide", () => {
    expect(workspaceSlug("Avshalom Dayan", "a1b2c3")).toBe("avshalom-dayan-a1b2c3");
    expect(workspaceSlug("Jan", "zz9")).toBe("jan-zz9");
  });

  it("drops accents and anything that is not a letter or a digit", () => {
    expect(workspaceSlug("Zoë O'Brien's team!", "x1")).toBe("zoe-o-brien-s-team-x1");
  });

  it("falls back to 'workspace' when nothing of the name is left", () => {
    expect(workspaceSlug("李", "x1")).toBe("workspace-x1");
    expect(workspaceSlug("", "x1")).toBe("workspace-x1");
  });

  it("keeps the slug short however long the name is", () => {
    expect(workspaceSlug("a".repeat(200), "x1").length).toBeLessThanOrEqual(43);
  });
});
