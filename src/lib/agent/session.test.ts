import { describe, expect, it } from "vitest";
import { sessionIdOf } from "./session";

const SID = "4ce297d7-9259-45e8-a3d0-2892c967c196";

describe("sessionIdOf", () => {
  it("reads the session id from the init message", () => {
    expect(sessionIdOf({ type: "system", subtype: "init", session_id: SID, model: "claude-sonnet-5", tools: [] })).toBe(SID);
  });

  it("ignores every other message, even the ones that carry a session id too", () => {
    expect(sessionIdOf({ type: "result", subtype: "success", session_id: SID })).toBeNull();
    expect(sessionIdOf({ type: "assistant", session_id: SID, message: { content: [] } })).toBeNull();
    expect(sessionIdOf({ type: "system", subtype: "status", session_id: SID })).toBeNull();
  });

  it("answers null for an init message without a usable id, and for things that are not messages", () => {
    expect(sessionIdOf({ type: "system", subtype: "init" })).toBeNull();
    expect(sessionIdOf({ type: "system", subtype: "init", session_id: "" })).toBeNull();
    expect(sessionIdOf(null)).toBeNull();
    expect(sessionIdOf("init")).toBeNull();
  });
});
