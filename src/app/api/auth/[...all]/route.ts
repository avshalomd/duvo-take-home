import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";

// Better Auth's own endpoints: sign-in, sign-up, sign-out, the session, OAuth callbacks, organizations.
export const { GET, POST } = toNextJsHandler(auth);
