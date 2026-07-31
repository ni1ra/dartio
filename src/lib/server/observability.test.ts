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
    record("match.recorded", { userId: "user-1", mode: "x01", count: 12 });

    expect(lines[0]).toMatchObject({ event: "match.recorded", severity: "info", userId: "user-1", mode: "x01", count: 12 });
    expect(Date.parse(String(lines[0]!.at))).not.toBeNaN();
  });

  it("takes a failure's reason from the error rather than from the caller", () => {
    const lines = captured();
    recordFailure("room.turn_failed", new TypeError("connection reset"), { userId: "user-1" });

    // A message written by the caller can drift from what actually went wrong.
    expect(lines[0]).toMatchObject({ event: "room.turn_failed", severity: "error", reason: "TypeError: connection reset" });
  });

  it("does not pretend to know what a non-error was", () => {
    const lines = captured();
    recordFailure("room.turn_failed", "a string somebody threw");
    expect(lines[0]).toMatchObject({ reason: "unknown" });
  });
});

describe("what a line must never carry", () => {
  it("has no field for a secret, a token, a cookie, or an email", () => {
    const lines = captured();
    // Only the declared fields survive; anything else is a type error at the call
    // site and is dropped here even when a caller reaches past the types.
    record("match.recorded", { userId: "user-1", email: "lain@example.com", token: "secret" } as never);

    const keys = Object.keys(lines[0]!);
    expect(keys).toContain("userId");
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("token");
  });
});
