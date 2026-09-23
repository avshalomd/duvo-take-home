import { describe, expect, it } from "vitest";
import { findCredentials } from "./credentials";
import { writeCheck } from "./write";

// Every fake credential is assembled at run time, so a secret scanner reading this file on a push does not
// mistake the fixtures for a leak. None of them is real.
const join = (...parts: string[]) => parts.join("");
export const FAKE = {
  aws: join("AKIA", "IOSFODNN7EXAMPLE"),
  anthropic: join("sk-", "ant-api03-", "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5bC7dE9"),
  openai: join("sk-", "Tq9Lm2Vx8Rk4Wp6Zs1Hd3Fj5Gn7Bc0Ya2Ue4Io6Nt8Mr"),
  openrouter: join("sk-", "or-v1-", "0123456789abcdef".repeat(4)),
  github: join("gh", "p_", "A1b2C3d4E5f6".repeat(3)),
  githubOauth: join("gh", "o_", "Z9y8X7w6V5u4".repeat(3)),
  githubPat: join("github", "_pat_", "11AB2CD3EF4_", "Gh5Ij6Kl7Mn8".repeat(5)),
  slack: join("xo", "xb-", "1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx"),
  pem: join("-----BEGIN ", "RSA PRIVATE KEY-----\n", "MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gunVTLw\n", "-----END RSA PRIVATE KEY-----"),
  jwt: join("eyJ", "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", ".eyJ", "zdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0", ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"),
};

describe("findCredentials: what counts as a credential", () => {
  it.each([
    ["an AWS access key", `aws_access_key_id = ${FAKE.aws}`],
    ["an Anthropic-style API key", `ANTHROPIC_API_KEY=${FAKE.anthropic}`],
    ["an OpenAI-style API key", `key: ${FAKE.openai}`],
    ["an OpenRouter-style API key", FAKE.openrouter],
    ["a GitHub personal token", `token ${FAKE.github}`],
    ["a GitHub OAuth token", FAKE.githubOauth],
    ["a GitHub fine-grained token", FAKE.githubPat],
    ["a Slack token", FAKE.slack],
    ["a PEM private key", FAKE.pem],
    ["a JSON web token", `Authorization: Bearer ${FAKE.jwt}`],
    ["a password assignment", "password=Xk9mQ2vL8pR4tZ"],
    ["a quoted password in JSON", '{"db_password": "Xk9mQ2vL8pR4tZ"}'],
    ["a client secret in YAML", "client_secret: 7fGh2Kd9Lm4Qp8Rs"],
  ])("finds %s", (_what, text) => {
    expect(findCredentials(text)).toHaveLength(1);
  });

  it.each([
    ["a public key", "-----BEGIN PUBLIC KEY-----"],
    ["a certificate", "-----BEGIN CERTIFICATE-----"],
    ["the library sk-learn written with a hyphen", "We used sk-learn-pipelines-and-transformers for the model"],
    ["a word ending in sk followed by an id", "see the task-1234567890abcdefghijklmnop board"],
    ["a string too short to be an AWS key", "AKIA1234"],
    ["a GitHub prefix with no token", "ghp_short"],
    ["a Slack prefix with no token", "xoxb-123"],
    ["a JWT header on its own", "eyJhbGciOiJIUzI1NiJ9"],
    ["a form label", "password: required"],
    ["a masked password", "password = ********************"],
    ["a placeholder variable", "password=${DB_PASSWORD_FROM_THE_VAULT}"],
    ["a placeholder in angle brackets", "Password: <your password here>"],
    ["a placeholder in words", "api_key=your-api-key-goes-here"],
    ["a short value", "password=hunter2"],
  ])("does not flag %s", (_what, text) => {
    expect(findCredentials(text)).toEqual([]);
  });

  it("names the kind and the line of each credential", () => {
    const text = ["name,value", "a,1", `key,${FAKE.anthropic}`].join("\n");
    expect(findCredentials(text)).toEqual([{ label: "an API key", line: 3 }]);
  });

  it("counts a key once when a password-style assignment wraps it", () => {
    expect(findCredentials(`OPENAI_API_KEY=${FAKE.openai}`)).toEqual([{ label: "an API key", line: 1 }]);
  });

  it("finds every credential in a longer file", () => {
    const text = [`a=${FAKE.aws}`, "nothing here", FAKE.pem, FAKE.slack].join("\n");
    expect(findCredentials(text).map((h) => h.label)).toEqual(["an AWS access key", "a private key", "a Slack token"]);
  });
});

describe("write guard", () => {
  it("blocks a Write whose content holds a credential, naming the line and telling the agent to remove it", () => {
    const v = writeCheck("Write", { file_path: "report.md", content: `# Notes\n\nkey: ${FAKE.anthropic}\n` });
    expect(v).toMatchObject({ decision: "blocked", target: "report.md" });
    expect(v).toHaveProperty("reason", expect.stringMatching(/an API key on line 3/));
    expect(v).toHaveProperty("reason", expect.stringMatching(/remove the credential and write the file again/i));
  });

  it("allows a Write of an ordinary CSV", () => {
    const v = writeCheck("Write", { file_path: "output.csv", content: "title,url\nA,https://example.com/a\n" });
    expect(v).toMatchObject({ decision: "allowed" });
  });

  // AgentLimits.toolFileExtensions: .svg and .xlsx are made only by the output tools. Enforced here, so the output
  // scan can trust that an .svg is the chart tool's (Q142) and a hand-written one never reaches the user.
  it.each([
    ["chart.svg", /make_chart/],
    ["Report.XLSX", /make_spreadsheet/],
  ])("blocks a Write of %s and names the tool that makes it", (file, tool) => {
    const v = writeCheck("Write", { file_path: file, content: "<svg/>" });
    expect(v).toMatchObject({ decision: "blocked", target: file });
    expect(v.reason).toMatch(tool);
  });

  it("allows a call with no content to scan", () => {
    expect(writeCheck("Write", { file_path: "empty.txt" })).toMatchObject({ decision: "allowed" });
  });
});
