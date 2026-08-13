import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  classifyTrebleTwentyVoiceSuccess,
  hasPrivateNoStore,
  isExpectedTrebleTwentyVoiceSuccess,
  resolveLiveVoiceConfiguration,
} from "../../../scripts/verify-voice-live-config.mjs";

const credentials = {
  DARTIO_QA_EMAIL: "qa@example.test",
  DARTIO_QA_PASSWORD: "synthetic-password",
};

describe("the live voice verifier configuration boundary", () => {
  it.each([
    ["https://dartioopus46.vercel.app", "https://dartioopus46.vercel.app"],
    ["http://dartio.vercel.app", "https://dartio.vercel.app"],
    ["https://dartio-voice-niras-projects-868b6f5f.vercel.app", "https://dartio-voice-niras-projects-868b6f5f.vercel.app"],
    ["http://localhost:3100", "http://localhost:3100"],
  ])("accepts and safely resolves the trusted origin %s", (target, origin) => {
    expect(resolveLiveVoiceConfiguration([target], credentials)).toMatchObject({
      ok: true,
      origin,
    });
  });

  it("normalizes a terminal DNS root dot before using the trusted origin", () => {
    expect(resolveLiveVoiceConfiguration(["https://dartio.vercel.app."], credentials)).toEqual({
      ok: true,
      origin: "https://dartio.vercel.app",
      email: credentials.DARTIO_QA_EMAIL,
      password: credentials.DARTIO_QA_PASSWORD,
    });
  });

  it.each([
    "MALFORMED_SECRET_SENTINEL",
    "ftp://dartio.vercel.app",
    "https://user:password@dartio.vercel.app",
    "https://dartio.vercel.app/play",
    "https://dartio-voice-niras-projects-868b6f5f.vercel.app.evil.example",
  ])("generically refuses an invalid target without reflecting %s", (target) => {
    const result = resolveLiveVoiceConfiguration([target], credentials);
    expect(result).toEqual({
      ok: false,
      message: "REFUSED the Dartio deployment origin is invalid or untrusted",
    });
    if (result.ok) throw new Error("expected target refusal");
    expect(result.message).not.toContain(target);
  });

  it("refuses positional configuration without reflecting it", () => {
    const sentinel = "POSITIONAL_SECRET_SENTINEL";
    const result = resolveLiveVoiceConfiguration([
      "https://dartio.vercel.app",
      sentinel,
    ], credentials);
    expect(result).toEqual({
      ok: false,
      message: "REFUSED credentials and other configuration must never be positional arguments",
    });
    if (result.ok) throw new Error("expected positional refusal");
    expect(result.message).not.toContain(sentinel);
  });

  it.each([
    {},
    { DARTIO_QA_EMAIL: "qa@example.test" },
    { DARTIO_QA_PASSWORD: "synthetic-password" },
  ])("fails closed without both environment credentials", (environment) => {
    expect(resolveLiveVoiceConfiguration(["https://dartio.vercel.app"], environment)).toEqual({
      ok: false,
      message: "REFUSED DARTIO_QA_EMAIL and DARTIO_QA_PASSWORD are required",
    });
  });

  it("uses a voice-specific package-entrypoint message", () => {
    expect(resolveLiveVoiceConfiguration([], credentials)).toEqual({
      ok: false,
      message: "usage: pnpm verify:voice:live <deployment-origin>",
    });
  });
});

describe("the live voice response boundary", () => {
  const success = {
    transcript: "treble twenty",
    command: { type: "dart", segment: 20, multiplier: 3 },
    confidence: 0.92,
  };

  it("accepts only a measured strict T20 result", () => {
    expect(isExpectedTrebleTwentyVoiceSuccess(success)).toBe(true);
    expect(classifyTrebleTwentyVoiceSuccess(success)).toBe("expected");
  });

  it("allows one bounded retry only for a structurally valid unexpected command", () => {
    expect(classifyTrebleTwentyVoiceSuccess({
      ...success,
      command: { type: "dart", segment: 1, multiplier: 1 },
    })).toBe("unexpected");
    expect(classifyTrebleTwentyVoiceSuccess({ ...success, command: null })).toBe("unexpected");
    expect(classifyTrebleTwentyVoiceSuccess({ ...success, command: { type: "dart", segment: 25, multiplier: 3 } })).toBe("malformed");
    expect(classifyTrebleTwentyVoiceSuccess({ ...success, command: { type: "turn_score", score: 181 } })).toBe("malformed");
  });

  it.each([
    null,
    {},
    { ...success, confidence: 0 },
    { ...success, confidence: Number.NaN },
    { ...success, confidence: 1.01 },
    { ...success, transcript: "" },
    { ...success, command: null },
    { ...success, command: { type: "dart", segment: 20, multiplier: 1 } },
    { ...success, plan: "pro" },
    { ...success, command: { ...success.command, score: 60 } },
  ])("rejects an absent, widened, unmeasured, or wrong command", (payload) => {
    expect(isExpectedTrebleTwentyVoiceSuccess(payload)).toBe(false);
  });

  it.each([
    "private, no-store",
    "NO-STORE, PRIVATE",
    "max-age=0, private, no-store",
  ])("accepts both cache protections in %s", (value) => {
    expect(hasPrivateNoStore(value)).toBe(true);
  });

  it("ships one small synthetic RIFF/WAVE fixture", async () => {
    const encoded = await readFile(
      new URL("../../../scripts/fixtures/voice-treble-twenty.wav.b64", import.meta.url),
      "utf8",
    );
    const fixture = Buffer.from(encoded.replace(/\s+/g, ""), "base64");
    expect(fixture.length).toBeGreaterThan(1_000);
    expect(fixture.length).toBeLessThan(64 * 1024);
    expect(fixture.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(fixture.subarray(8, 12).toString("ascii")).toBe("WAVE");
  });
});
