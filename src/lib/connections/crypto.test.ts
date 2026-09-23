// Connection secrets at rest: AES-256-GCM under CONNECTION_KEY, sealed as "v1:<iv>:<tag>:<ciphertext>" (base64 parts).
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretError, decryptSecret, encryptSecret } from "./crypto";

const saved = process.env.CONNECTION_KEY;
const freshKey = () => randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.CONNECTION_KEY = freshKey(); // a throwaway key per test: no test ever touches the real one
});
afterEach(() => {
  process.env.CONNECTION_KEY = saved;
});

// Flip one character of one base64 part, keeping the envelope's shape, as someone editing the column by hand would.
function tamper(sealed: string, part: 1 | 2 | 3): string {
  const parts = sealed.split(":");
  const chars = [...parts[part]];
  chars[0] = chars[0] === "A" ? "B" : "A";
  parts[part] = chars.join("");
  return parts.join(":");
}

describe("encryptSecret and decryptSecret", () => {
  it("gives back the exact token that was sealed", () => {
    const token = "ghp_abc123-DEF.456/xyz=";
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it("round-trips unicode and an empty string", () => {
    expect(decryptSecret(encryptSecret("clé secrète ✓"))).toBe("clé secrète ✓");
    expect(decryptSecret(encryptSecret(""))).toBe("");
  });

  it("seals as a versioned envelope of four parts that never contains the plain token", () => {
    const sealed = encryptSecret("secret-value");
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed.split(":")).toHaveLength(4);
    expect(sealed).not.toContain("secret-value");
  });

  it("seals the same token differently each time, because every envelope has its own random iv", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("refuses a tampered ciphertext with a readable error instead of returning garbage", () => {
    const sealed = encryptSecret("secret-value");
    expect(() => decryptSecret(tamper(sealed, 3))).toThrow(SecretError);
    expect(() => decryptSecret(tamper(sealed, 3))).toThrow(/could not be read/i);
  });

  it("refuses a tampered authentication tag or iv", () => {
    const sealed = encryptSecret("secret-value");
    expect(() => decryptSecret(tamper(sealed, 2))).toThrow(SecretError);
    expect(() => decryptSecret(tamper(sealed, 1))).toThrow(SecretError);
  });

  it("refuses an envelope sealed under another key", () => {
    const sealed = encryptSecret("secret-value");
    process.env.CONNECTION_KEY = freshKey();
    expect(() => decryptSecret(sealed)).toThrow(/could not be read/i);
  });

  it("refuses a value that is not an envelope at all, or of an unknown version", () => {
    expect(() => decryptSecret("secret-value")).toThrow(SecretError);
    expect(() => decryptSecret(encryptSecret("x").replace(/^v1:/, "v9:"))).toThrow(/version/i);
  });

  it("names CONNECTION_KEY when the key is missing, for sealing and for reading", () => {
    const sealed = encryptSecret("secret-value");
    delete process.env.CONNECTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/CONNECTION_KEY/);
    expect(() => decryptSecret(sealed)).toThrow(/CONNECTION_KEY/);
  });

  it("refuses a key that is not 32 bytes, rather than silently using a weaker one", () => {
    process.env.CONNECTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});
