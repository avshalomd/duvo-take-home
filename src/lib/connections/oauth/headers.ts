import "server-only";
import type { AuthHeaders } from "@/contracts/connection";

export const authHeaders: AuthHeaders = async () => {
  throw new Error("not implemented: authHeaders");
};
