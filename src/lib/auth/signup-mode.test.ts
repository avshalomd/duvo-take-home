import { describe, expect, it } from "vitest";
import { signupMode } from "./signup-mode";

describe("signupMode", () => {
  it("is open when SIGNUP_MODE is not set, so local work and the e2e suite need no setup", () => {
    expect(signupMode(undefined)).toBe("open");
    expect(signupMode("")).toBe("open");
  });

  it("reads the two modes, whatever their case or spaces", () => {
    expect(signupMode("open")).toBe("open");
    expect(signupMode("invite")).toBe("invite");
    expect(signupMode(" Invite ")).toBe("invite");
  });

  it("reads a value it does not know as invite-only, so a typo in production never opens sign-up", () => {
    expect(signupMode("invites")).toBe("invite");
    expect(signupMode("closed")).toBe("invite");
  });
});
