import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth/actions", () => ({ acceptInvitation: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/client", () => ({ authClient: { signUp: { email: vi.fn() } } }));

import { SignUpForm } from "./sign-up-form";

// UX QA U27: `minLength` on the password made the browser answer a short one with its own bubble, before the app
// could; the rule is the form's own now, said under the field.
describe("SignUpForm", () => {
  it("leaves the password's length to the form's own error, not the browser's", () => {
    const html = renderToStaticMarkup(<SignUpForm next="/" google={false} />);
    const password = /<input[^>]*id="password"[^>]*>/.exec(html)?.[0] ?? "";
    expect(password).not.toBe("");
    expect(password).not.toMatch(/minlength/i);
  });
});
