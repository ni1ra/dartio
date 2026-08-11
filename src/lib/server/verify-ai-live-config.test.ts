import { describe, expect, it } from "vitest";
import { seededRandom, throwAiDart, type Aim } from "@/domain/ai-throw";
import {
  hasPrivateNoStore,
  isPlausiblyAimedSample,
  LIVE_AI_SAMPLE_SIZE,
  parsePhysicallyConsistentDart,
  resolveLiveAiConfiguration,
} from "../../../scripts/verify-ai-live-config.mjs";

const credentials = {
  DARTIO_QA_EMAIL: "qa@example.test",
  DARTIO_QA_PASSWORD: "synthetic-password",
};

describe("the live AI verifier configuration boundary", () => {
  it.each([
    ["https://dartioopus46.vercel.app", "https://dartioopus46.vercel.app"],
    ["http://dartioopus46.vercel.app", "https://dartioopus46.vercel.app"],
    ["https://dartio.vercel.app", "https://dartio.vercel.app"],
    ["http://dartio.vercel.app", "https://dartio.vercel.app"],
    ["https://dartio-ak6pififa-niras-projects-868b6f5f.vercel.app", "https://dartio-ak6pififa-niras-projects-868b6f5f.vercel.app"],
    ["http://dartio-git-cycle-25-ai-throw-niras-projects-868b6f5f.vercel.app", "https://dartio-git-cycle-25-ai-throw-niras-projects-868b6f5f.vercel.app"],
    ["http://localhost:3100", "http://localhost:3100"],
    ["http://127.0.0.1:3100", "http://127.0.0.1:3100"],
  ])("accepts and safely resolves the trusted origin %s", (target, origin) => {
    expect(resolveLiveAiConfiguration([target], credentials)).toMatchObject({
      ok: true,
      origin,
    });
  });

  it("normalizes a terminal DNS root dot before using the trusted origin", () => {
    expect(resolveLiveAiConfiguration(["https://dartio.vercel.app."], credentials)).toEqual({
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
    "https://dartio.vercel.app?secret=query",
    "https://dartio.vercel.app#secret-fragment",
    "https://dartio.vercel.app:444",
    "https://dartio-attacker.vercel.app",
    "https://dartio-preview-niras-projects-868b6f5f.vercel.app.evil.example",
  ])("generically refuses an invalid or untrusted target without reflecting %s", (target) => {
    const result = resolveLiveAiConfiguration([target], credentials);
    expect(result).toEqual({
      ok: false,
      message: "REFUSED the Dartio deployment origin is invalid or untrusted",
    });
    if (result.ok) throw new Error("expected target refusal");
    expect(result.message).not.toContain(target);
  });

  it("refuses additional positional values without reflecting them", () => {
    const sentinel = "POSITIONAL_SECRET_SENTINEL";
    const result = resolveLiveAiConfiguration(["https://dartio.vercel.app", sentinel], credentials);
    expect(result).toEqual({
      ok: false,
      message: "REFUSED credentials and other configuration must never be positional arguments",
    });
    if (result.ok) throw new Error("expected argument refusal");
    expect(result.message).not.toContain(sentinel);
  });

  it.each([
    {},
    { DARTIO_QA_EMAIL: "qa@example.test" },
    { DARTIO_QA_PASSWORD: "synthetic-password" },
    { DARTIO_QA_EMAIL: "", DARTIO_QA_PASSWORD: "synthetic-password" },
    { DARTIO_QA_EMAIL: "qa@example.test", DARTIO_QA_PASSWORD: "" },
  ])("fails closed when either environment-only credential is absent", (environment) => {
    expect(resolveLiveAiConfiguration(["https://dartio.vercel.app"], environment)).toEqual({
      ok: false,
      message: "REFUSED DARTIO_QA_EMAIL and DARTIO_QA_PASSWORD are required",
    });
  });

  it("does not accept an environment target in place of the positional origin", () => {
    expect(resolveLiveAiConfiguration([], {
      ...credentials,
      DARTIO_BASE_URL: "https://dartio.vercel.app",
    })).toEqual({ ok: false, message: "usage: pnpm verify:ai:live <deployment-origin>" });
  });
});

describe("the live AI response boundary", () => {
  it.each([
    { segment: 25, multiplier: 2, score: 50, x: 0, y: 0 },
    { segment: 25, multiplier: 1, score: 25, x: 0, y: 0.06 },
    { segment: 20, multiplier: 3, score: 60, x: 0, y: -103 / 170 },
    { segment: 20, multiplier: 2, score: 40, x: 0, y: -166 / 170 },
    { segment: 20, multiplier: 1, score: 20, x: 0, y: -0.72 },
    { segment: 0, multiplier: 1, score: 0, x: 0, y: -1.05 },
  ])("accepts one strict dart whose coordinates reproduce its score", (dart) => {
    expect(parsePhysicallyConsistentDart({ dart })).toEqual(dart);
  });

  it.each([
    null,
    {},
    { darts: [] },
    { dart: { segment: 20, multiplier: 3, score: 60, x: 0, y: -103 / 170 }, plan: "pro" },
    { dart: { segment: 20, multiplier: 3, score: 60, x: 0, y: -103 / 170, aim: "T20" } },
    { dart: { segment: 20, multiplier: 3, score: 20, x: 0, y: -103 / 170 } },
    { dart: { segment: 20, multiplier: 3, score: 60, x: 0, y: 0 } },
    { dart: { segment: 25, multiplier: 3, score: 75, x: 0, y: 0 } },
    { dart: { segment: 0, multiplier: 2, score: 0, x: 0, y: -1.05 } },
    { dart: { segment: 21, multiplier: 1, score: 21, x: 0, y: -0.72 } },
    { dart: { segment: 20, multiplier: 1, score: 20, x: Number.POSITIVE_INFINITY, y: 0 } },
  ])("rejects malformed, widened, or physically inconsistent payloads", (payload) => {
    expect(parsePhysicallyConsistentDart(payload)).toBeNull();
  });

  it("relates each level-20 landing to the requested target family", () => {
    const trebleTwenty = {
      segment: 20,
      multiplier: 3,
      score: 60,
      x: 0,
      y: -103 / 170,
    };
    const sample = Array.from({ length: LIVE_AI_SAMPLE_SIZE }, () => trebleTwenty);
    expect(isPlausiblyAimedSample(sample, { segment: 20, multiplier: 3 })).toBe(true);
    expect(isPlausiblyAimedSample(sample, { segment: 7, multiplier: 1 })).toBe(false);
    expect(isPlausiblyAimedSample(sample, { segment: 25, multiplier: 2 })).toBe(false);
  });

  it("rejects a sampler that honors the segment but ignores the multiplier", () => {
    const stockSingleTwenty = {
      segment: 20,
      multiplier: 1,
      score: 20,
      x: 0,
      y: -0.72,
    };
    const sample = Array.from({ length: LIVE_AI_SAMPLE_SIZE }, () => stockSingleTwenty);
    expect(isPlausiblyAimedSample(sample, { segment: 20, multiplier: 1 })).toBe(true);
    expect(isPlausiblyAimedSample(sample, { segment: 20, multiplier: 3 })).toBe(false);
    expect(isPlausiblyAimedSample(sample, { segment: 20, multiplier: 2 })).toBe(false);
  });

  it("requires the full statistical sample before claiming target execution", () => {
    const doubleBull = { segment: 25, multiplier: 2, score: 50, x: 0, y: 0 };
    expect(isPlausiblyAimedSample([doubleBull], { segment: 25, multiplier: 2 })).toBe(false);
  });

  it.each([
    { segment: 20, multiplier: 1 },
    { segment: 20, multiplier: 2 },
    { segment: 20, multiplier: 3 },
    { segment: 25, multiplier: 1 },
    { segment: 25, multiplier: 2 },
  ] satisfies readonly Aim[])("accepts the production level-20 sampler for $segment×$multiplier", (target) => {
    const random = seededRandom(target.segment * 101 + target.multiplier);
    const sample = Array.from(
      { length: LIVE_AI_SAMPLE_SIZE },
      () => {
        const dart = throwAiDart(20, target, random).dart;
        if (dart.x === undefined || dart.y === undefined) {
          throw new Error("the physical AI sampler returned no landing coordinates");
        }
        return { ...dart, x: dart.x, y: dart.y };
      },
    );
    expect(isPlausiblyAimedSample(sample, target)).toBe(true);
  });

  it.each([
    "private, no-store",
    "NO-STORE, PRIVATE",
    "max-age=0, private, no-store",
  ])("accepts both required cache directives in %s", (value) => {
    expect(hasPrivateNoStore(value)).toBe(true);
  });

  it.each([null, "", "private", "no-store", "public, no-store"])(
    "rejects a missing or incomplete cache policy",
    (value) => expect(hasPrivateNoStore(value)).toBe(false),
  );
});
