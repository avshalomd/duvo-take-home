"use client";

import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// The browser side of Better Auth: the sign-in and sign-up forms call it, and it talks to /api/auth/* on the page's
// own origin (no baseURL), so the same build works on localhost:3004 and on the deployed URL.
export const authClient = createAuthClient({ plugins: [organizationClient()] });
