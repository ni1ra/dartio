import { afterEach, describe, expect, it } from "vitest";
import { record, recordFailure, setObservabilitySink } from "./observability";

afterEach(() => setObservabilitySink(null));

function captured() {
  const lines: Record<string, unknown>[] = [];
  setObservabilitySink((line) => lines.push(line as unknown as Record<string, unknown>));
  return lines;
}

describe("what a line carries", () => {
  it("names the event, its severity, and when it happened", () => {
    const lines = captured();
    record("match.recorded", { mode: "x01", count: 12 });

    expect(lines[0]).toMatchObject({ event: "match.recorded", severity: "info", mode: "x01", count: 12 });
    expect(Date.parse(String(lines[0]!.at))).not.toBeNaN();
  });

  it.each([
    [new DOMException("secret", "AbortError"), "abort"],
    [new SyntaxError("secret"), "syntax"],
    [new TypeError("secret"), "type"],
    [new Error("secret"), "error"],
    ["a string somebody threw", "unknown"],
  ] as const)("reduces %s to a fixed failure category", (cause, failure) => {
    const lines = captured();
    recordFailure("room.turn_failed", cause);

    expect(lines[0]).toMatchObject({ event: "room.turn_failed", severity: "error", failure });
  });
});

describe("what a line must never carry", () => {
  it("has no field for identity, a secret, a token, a cookie, or an email", () => {
    const lines = captured();
    // Only the declared fields survive; anything else is a type error at the call
    // site and is dropped here even when a caller reaches past the types.
    record("match.recorded", {
      userId: "private-user",
      email: "private@example.invalid",
      token: "private-token",
    } as never);

    const keys = Object.keys(lines[0]!);
    expect(keys).not.toContain("userId");
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("token");
  });

  it("never serializes an error name or message", () => {
    const lines = captured();
    const cause = new Error("private-message");
    cause.name = "private-name";

    recordFailure("match.record_failed", cause);

    const serialized = JSON.stringify(lines[0]);
    expect(serialized).not.toContain("private-message");
    expect(serialized).not.toContain("private-name");
    expect(lines[0]).toMatchObject({ failure: "error" });
  });
});
