import { describe, expect, it } from "vitest";
import { ORGANIZATION_WRITES_REFUSED, organizationWriteRefusal } from "./organization-writes";

// Security review S4 and QA F2-F4: Better Auth's own organization endpoints skipped the app's rules (the member-change
// lock, name limits, one pending invitation, no deleting). The app makes these writes only through its actions, with
// auth.api; over HTTP they are refused. What the app's own client calls over HTTP keeps working.
describe("organizationWriteRefusal", () => {
  it.each([
    "/organization/create",
    "/organization/update",
    "/organization/delete",
    "/organization/invite-member",
    "/organization/cancel-invitation",
    "/organization/update-member-role",
    "/organization/remove-member",
    "/organization/leave",
  ])("refuses %s over HTTP, in plain words", (path) => {
    expect(organizationWriteRefusal(path, true)).toBe(ORGANIZATION_WRITES_REFUSED);
  });

  it("lets the app's own actions make the same writes through auth.api", () => {
    expect(organizationWriteRefusal("/organization/update-member-role", false)).toBeNull();
    expect(organizationWriteRefusal("/organization/create", false)).toBeNull();
  });

  it.each([
    "/sign-in/email",
    "/sign-up/email",
    "/sign-in/social",
    "/get-session",
    "/sign-out",
    "/organization/set-active",
    "/organization/accept-invitation",
    "/organization/reject-invitation",
    "/organization/get-full-organization",
    "/organization/list",
  ])("keeps %s working over HTTP", (path) => {
    expect(organizationWriteRefusal(path, true)).toBeNull();
  });

  it("says where the change is made instead, without naming an endpoint", () => {
    expect(ORGANIZATION_WRITES_REFUSED).not.toMatch(/organization|endpoint|api/i);
  });
});
