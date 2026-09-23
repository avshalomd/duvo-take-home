import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// No `import "server-only"` here: scripts/encrypt-tokens.ts runs this outside Next, where that import throws. It
// cannot leak into a browser either way: the key is a server variable (no NEXT_PUBLIC_ prefix), so every call fails.

/**
 * Connection secrets at rest: AES-256-GCM under CONNECTION_KEY (32 bytes, base64), sealed as one text value,
 * "v1:<iv>:<tag>:<ciphertext>" with each part in base64. The connections store and the OAuth module both use it.
 */

/** A secret could not be sealed or read. `problem` says whether the key or the stored value is at fault. */
export class SecretError extends Error {
  constructor(
    message: string,
    readonly problem: "key" | "sealed",
  ) {
    super(message);
    this.name = "SecretError";
  }
}

const VERSION = "v1"; // the envelope names its format, so another key or cipher can be added later beside this one
const ALGORITHM = "aes-256-gcm"; // authenticated: one changed byte fails the tag check instead of decrypting to garbage
const IV_BYTES = 12; // the nonce length GCM is specified for
const TAG_BYTES = 16; // the full tag; without saying so, GCM would also accept a truncated (weaker) one

function key(): Buffer {
  const raw = process.env.CONNECTION_KEY;
  if (!raw) throw new SecretError("CONNECTION_KEY is not set, so connection tokens cannot be saved or read. Add 32 random bytes, base64-encoded, to the environment.", "key");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new SecretError(`CONNECTION_KEY must be 32 bytes, base64-encoded; this one is ${bytes.length} bytes.`, "key");
  return bytes;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES); // fresh for every secret: GCM must never reuse an iv under the same key
  const cipher = createCipheriv(ALGORITHM, key(), iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(sealed: string): string {
  const parts = sealed.split(":"); // base64 never contains ":", so the separator is unambiguous
  if (parts.length !== 4) throw new SecretError("A saved secret could not be read: it is not a sealed value.", "sealed");
  const [version, iv, tag, ciphertext] = parts;
  if (version !== VERSION) throw new SecretError(`A saved secret could not be read: its version "${version}" is unknown.`, "sealed");

  const k = key(); // outside the try: a missing key must say so, not read as a damaged value
  try {
    const decipher = createDecipheriv(ALGORITHM, k, Buffer.from(iv, "base64"), { authTagLength: TAG_BYTES });
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // node's own words ("Unsupported state or unable to authenticate data") say nothing a person can act on
    throw new SecretError("A saved secret could not be read: it was changed, or sealed under another CONNECTION_KEY.", "sealed");
  }
}
