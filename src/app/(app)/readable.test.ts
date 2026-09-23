import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmError } from "@/lib/llm/errors";
import { readable } from "./readable";

// Q60: an action's catch block used to hand the browser any Error.message, which is where a Postgres error puts
// the host, the user and the certificate. Only the errors written for a person are forwarded.
describe("readable", () => {
  it("forwards a model failure, which is already written for the user", () => {
    expect(readable(new LlmError("The model took too long (60 s). Retry.", "timeout"))).toBe(
      "The model took too long (60 s). Retry.",
    );
  });

  it("forwards a validation message, which names the field the user must fix", () => {
    const bad = z.object({ url: z.url("A full http(s) URL") }).safeParse({ url: "nope" });
    expect(readable(bad.error)).toBe("A full http(s) URL");
  });

  it("turns a database or unknown error into one fixed sentence, and logs the original", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const leaky = new Error('connect ECONNREFUSED ep-x.eu-central-1.aws.neon.tech:5432 user "app_owner"');

    expect(readable(leaky)).toBe("Something went wrong on our side - try again");
    expect(readable("a string nobody threw on purpose")).toBe("Something went wrong on our side - try again");
    expect(log).toHaveBeenCalledWith("action failed", leaky);
    log.mockRestore();
  });
});
