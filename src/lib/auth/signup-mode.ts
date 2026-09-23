// Who may create an account: anyone ("open", the default, so local work and the e2e suite need no setup) or only
// someone holding a pending invitation ("invite", set on the production deploy). Read on every call, not once at
// start-up, so a test can turn it for one call.
export type SignupMode = "open" | "invite";

export function signupMode(value: string | undefined = process.env.SIGNUP_MODE): SignupMode {
  const mode = (value ?? "").trim().toLowerCase();
  if (mode === "" || mode === "open") return "open";
  return "invite"; // "invite", and any value this code does not know: a typo must never open sign-up by accident
}
