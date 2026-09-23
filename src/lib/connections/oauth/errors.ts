/** A sign-in failure whose message is written for the person: the callback puts it on the settings page as is. */
export class SignInError extends Error {
  override name = "SignInError";
}
