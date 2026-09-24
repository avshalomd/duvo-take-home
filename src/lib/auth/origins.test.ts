import { describe, expect, it } from "vitest";
import { trustedOrigins } from "./origins";

// Security review S6: production trusted http://localhost:3000-3010 for Better Auth's origin check and its redirects,
// so a page served by any dev server on a user's machine passed for the app.
describe("trustedOrigins", () => {
  it("trusts the local dev servers, main's and every worktree's, outside production", () => {
    expect(trustedOrigins("development")).toContain("http://localhost:3000");
    expect(trustedOrigins("development")).toContain("http://localhost:3010");
    expect(trustedOrigins("test")).toContain("http://localhost:3004");
  });

  it("trusts no localhost in production, where BETTER_AUTH_URL is the one origin", () => {
    expect(trustedOrigins("production")).toEqual([]);
  });
});
