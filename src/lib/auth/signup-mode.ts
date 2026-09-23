export type SignupMode = "open" | "invite";
export function signupMode(_value: string | undefined = process.env.SIGNUP_MODE): SignupMode {
  return "open"; // STUB
}
