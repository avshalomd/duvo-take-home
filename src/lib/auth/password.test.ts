import { describe, expect, it } from "vitest";
import { aboutPassword } from "./errors";
import { passwordRefusal } from "./password";

// UX QA U27: a short password got the browser's own bubble, unlike every other error in the app. The form now asks
// this rule itself and says the answer under the field.
describe("passwordRefusal - the sign-up form's password rule, in the app's words", () => {
  it("refuses a password under 8 characters", () => {
    expect(passwordRefusal("short")).toBe("Use at least 8 characters for the password.");
    expect(passwordRefusal("")).toBe("Use at least 8 characters for the password.");
  });

  it("accepts 8 characters and more", () => {
    expect(passwordRefusal("12345678")).toBeNull();
    expect(passwordRefusal("x".repeat(128))).toBeNull();
  });

  it("refuses one longer than Better Auth takes", () => {
    expect(passwordRefusal("x".repeat(129))).toBe("That password is too long. Use at most 128 characters.");
  });
});

describe("aboutPassword - a server refusal that belongs under the password field", () => {
  it("is true for the password's own codes and false for the rest", () => {
    expect(aboutPassword({ code: "PASSWORD_TOO_SHORT" })).toBe(true);
    expect(aboutPassword({ code: "PASSWORD_TOO_LONG" })).toBe(true);
    expect(aboutPassword({ code: "USER_ALREADY_EXISTS" })).toBe(false);
    expect(aboutPassword(null)).toBe(false);
  });
});
