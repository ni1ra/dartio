import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  HISTORY_REQUEST_TIMEOUT_MS,
  resolveHistoryConfiguration,
  secureHistoryRequestInit,
} from "../../../scripts/verify-history-config.mjs";

const credentials = {
  DARTIO_QA_EMAIL: "qa@example.test",
  DARTIO_QA_PASSWORD: "synthetic-password",
};

describe("the history verifier configuration boundary", () => {
  it.each([
    ["https://dartioopus46.vercel.app", "https://dartioopus46.vercel.app"],
    ["http://dartioopus46.vercel.app", "https://dartioopus46.vercel.app"],
    ["https://dartio.vercel.app", "https://dartio.vercel.app"],
    ["http://dartio.vercel.app", "https://dartio.vercel.app"],
    [
      "https://dartio-cycle-27-niras-projects-868b6f5f.vercel.app",
      "https://dartio-cycle-27-niras-projects-868b6f5f.vercel.app",
    ],
    [
      "http://dartio-git-cycle-27-match-replay-niras-projects-868b6f5f.vercel.app",
      "https://dartio-git-cycle-27-match-replay-niras-projects-868b6f5f.vercel.app",
    ],
    ["http://localhost:3100", "http://localhost:3100"],
    ["http://127.0.0.1:3100", "http://127.0.0.1:3100"],
    ["http://[::1]:3100", "http://[::1]:3100"],
  ])("accepts and safely resolves the trusted origin %s", (target, origin) => {
    expect(resolveHistoryConfiguration([target], credentials)).toMatchObject({
      ok: true,
      origin,
    });
  });

  it("normalizes a terminal DNS root dot before credentials can be used", () => {
    expect(resolveHistoryConfiguration(["http://dartio.vercel.app."], credentials)).toEqual({
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
    "https://dartio.vercel.app:444",
    "https://dartio.vercel.app/play",
    "https://dartio.vercel.app?secret=query",
    "https://dartio.vercel.app#secret-fragment",
    "https://dartio-attacker.vercel.app",
    "https://dartio-preview-niras-projects-868b6f5f.vercel.app.evil.example",
  ])("generically refuses an invalid target without reflecting %s", (target) => {
    const result = resolveHistoryConfiguration([target], credentials);
    expect(result).toEqual({
      ok: false,
      message: "REFUSED the Dartio deployment origin is invalid or untrusted",
    });
    if (result.ok) throw new Error("expected target refusal");
    expect(result.message).not.toContain(target);
  });

  it("refuses extra positional configuration without reflecting it", () => {
    const sentinel = "POSITIONAL_SECRET_SENTINEL";
    const result = resolveHistoryConfiguration([
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
    { DARTIO_QA_EMAIL: "", DARTIO_QA_PASSWORD: "synthetic-password" },
    { DARTIO_QA_EMAIL: "qa@example.test", DARTIO_QA_PASSWORD: "" },
  ])("fails closed when either environment-only credential is absent", (environment) => {
    expect(resolveHistoryConfiguration(["https://dartio.vercel.app"], environment)).toEqual({
      ok: false,
      message: "REFUSED DARTIO_QA_EMAIL and DARTIO_QA_PASSWORD are required",
    });
  });

  it("does not accept an ambient target in place of the positional origin", () => {
    expect(resolveHistoryConfiguration([], {
      ...credentials,
      DARTIO_BASE_URL: "https://dartio.vercel.app",
    })).toEqual({
      ok: false,
      message: "usage: pnpm verify:history <deployment-origin>",
    });
  });

  it("does not let an ambient target replace or redirect the positional origin", () => {
    expect(resolveHistoryConfiguration(["https://credential-sink.example"], {
      ...credentials,
      DARTIO_BASE_URL: "https://dartio.vercel.app",
    })).toEqual({
      ok: false,
      message: "REFUSED the Dartio deployment origin is invalid or untrusted",
    });
    expect(resolveHistoryConfiguration(["https://dartio.vercel.app"], {
      ...credentials,
      DARTIO_BASE_URL: "https://credential-sink.example",
    })).toMatchObject({
      ok: true,
      origin: "https://dartio.vercel.app",
    });
  });

  it("overrides redirect and timeout options at the final request boundary", () => {
    const callerSignal = AbortSignal.abort();
    const result = secureHistoryRequestInit({
      method: "POST",
      redirect: "follow",
      signal: callerSignal,
    });
    expect(result).toMatchObject({ method: "POST", redirect: "error" });
    expect(result.signal).toBeInstanceOf(AbortSignal);
    expect(result.signal).not.toBe(callerSignal);
    expect(result.signal.aborted).toBe(false);
    expect(HISTORY_REQUEST_TIMEOUT_MS).toBe(40_000);
  });

  it("keeps every executable request behind the redirect-blocking wrapper", async () => {
    const source = await readFile(
      new URL("../../../scripts/verify-history.mjs", import.meta.url),
      "utf8",
    );
    expect(source.match(/\bfetch\s*\(/gu)).toHaveLength(1);
    expect(source).toContain("fetch(`${origin}${path}`, secureHistoryRequestInit(init))");
    expect(source).not.toContain(".text()");
  });
});
