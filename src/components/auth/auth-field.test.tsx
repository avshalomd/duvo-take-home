import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthField } from "./auth-field";

// UX QA U27: a field's own error, under it, is said as soon as it appears and is named by the field itself.
describe("AuthField", () => {
  it("shows an error under the field as an alert the field is described by, in place of the hint", () => {
    const html = renderToStaticMarkup(<AuthField id="password" label="Password" name="password" hint="At least 8 characters." error="Use at least 8 characters for the password." />);
    expect(html).toMatch(/<input[^>]*aria-invalid="true"/);
    expect(html).toMatch(/<input[^>]*aria-describedby="password-error"/);
    expect(html).toMatch(/<p id="password-error" role="alert"[^>]*>Use at least 8 characters for the password\.<\/p>/);
    expect(html).not.toContain("At least 8 characters.</p>");
  });

  it("keeps the hint, and no error, while there is nothing wrong", () => {
    const html = renderToStaticMarkup(<AuthField id="password" label="Password" name="password" hint="At least 8 characters." />);
    expect(html).toMatch(/<input[^>]*aria-describedby="password-hint"/);
    expect(html).not.toMatch(/\saria-invalid=/); // the attribute; the class list names aria-invalid: as a variant
    expect(html).not.toContain('role="alert"');
  });
});
