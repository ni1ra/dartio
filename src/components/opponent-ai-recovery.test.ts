import { describe, expect, it } from "vitest";
import { AiThrowClientError } from "@/lib/product/ai-throw-client";
import { describeAiFailure, describeAiRefresh } from "./opponent-ai-recovery";

describe("opponent AI recovery", () => {
  it.each([401, 403] as const)("holds authorization failure %s as denied", (status) => {
    expect(describeAiFailure(new AiThrowClientError(
      status === 401 ? "authentication_required" : "advanced_ai_required",
      status,
    ))).toMatchObject({ kind: "denied", announcement: expect.stringContaining("authorization required") });
  });

  it("treats authority outage separately from denial", () => {
    expect(describeAiFailure(new AiThrowClientError("access_status_unavailable", 503)))
      .toMatchObject({ kind: "unavailable", message: expect.stringContaining("temporarily unavailable") });
  });

  it("releases a visit only after refreshed premium authority agrees", () => {
    expect(describeAiRefresh("ready")).toBeNull();
    expect(describeAiRefresh("required")).toMatchObject({ kind: "denied" });
    expect(describeAiRefresh("unavailable")).toMatchObject({ kind: "unavailable" });
  });
});
