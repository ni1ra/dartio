import { describe, expect, it } from "vitest";
import { confidenceFromLogprobs } from "./confidence";

describe("confidenceFromLogprobs", () => {
  it("returns the geometric mean token probability", () => {
    const confidence = confidenceFromLogprobs([
      { logprob: Math.log(0.9) },
      { logprob: Math.log(0.4) },
    ]);

    expect(confidence).toBeCloseTo(Math.sqrt(0.9 * 0.4), 12);
  });

  it("keeps every valid result inside the probability interval", () => {
    expect(confidenceFromLogprobs([{ logprob: 0 }])).toBe(1);
    expect(confidenceFromLogprobs([{ logprob: -1_000 }])).toBe(0);
  });

  it.each([
    undefined,
    null,
    [],
    [{ logprob: undefined }],
    [{ logprob: "high" }],
    [{ logprob: Number.NaN }],
    [{ logprob: Number.POSITIVE_INFINITY }],
    [{ logprob: Number.NEGATIVE_INFINITY }],
    [{ logprob: 0.01 }],
    [null],
  ])("fails closed for missing or malformed log probabilities: %j", (logprobs) => {
    expect(confidenceFromLogprobs(logprobs)).toBe(0);
  });
});
