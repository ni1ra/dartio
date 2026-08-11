import { afterEach, describe, expect, it } from "vitest";
import {
  PREVIEW_DATABASE_HOST,
  resolveLiveRoomConfiguration,
} from "../../../scripts/verify-rooms-live-config.mjs";

const previewTarget = "https://cycle-24-preview.vercel.app";
const previewDatabase =
  `DATABASE_URL=postgresql://neondb_owner:synthetic@${PREVIEW_DATABASE_HOST}/neondb?sslmode=require`;
const originalAmbientDatabase = process.env.DATABASE_URL;

afterEach(() => {
  if (originalAmbientDatabase === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalAmbientDatabase;
  }
});

describe("the Preview room writer configuration boundary", () => {
  it("ignores an ambient database and selects the validated ignored-file value", () => {
    process.env.DATABASE_URL =
      "postgresql://neondb_owner:synthetic@production.invalid/neondb";

    const result = resolveLiveRoomConfiguration([previewTarget], () => previewDatabase);

    expect(result).toMatchObject({ ok: true, origin: previewTarget });
    if (!result.ok) throw new Error("expected the Preview configuration to pass");
    expect(result.databaseUrl).toContain(PREVIEW_DATABASE_HOST);
  });

  it.each([
    "https://dartioopus46.vercel.app",
    "http://dartioopus46.vercel.app",
    "https://dartioopus46.vercel.app.",
    "http://dartioopus46.vercel.app.",
    "https://dartio.vercel.app",
    "http://dartio.vercel.app",
    "https://dartio.vercel.app.",
    "http://dartio.vercel.app.",
  ])("refuses Production at %s before reading the environment file", (target) => {
    let reads = 0;

    const result = resolveLiveRoomConfiguration(
      [target],
      () => {
        reads++;
        return previewDatabase;
      },
    );

    expect(result).toEqual({
      ok: false,
      message:
        "REFUSED this script grants temporary Pro rows and must never run against production",
    });
    expect(reads).toBe(0);
  });

  it("does not repeat a malformed target in its refusal", () => {
    const sentinel = "MALFORMED_SECRET_SENTINEL";

    const result = resolveLiveRoomConfiguration([sentinel], () => previewDatabase);

    expect(result).toEqual({
      ok: false,
      message: "REFUSED the Preview deployment URL is invalid",
    });
    if (result.ok) throw new Error("expected the malformed target to be refused");
    expect(result.message).not.toContain(sentinel);
  });

  it("does not repeat an unexpected positional value in its refusal", () => {
    const sentinel = "POSITIONAL_SECRET_SENTINEL";

    const result = resolveLiveRoomConfiguration(
      [previewTarget, sentinel],
      () => previewDatabase,
    );

    expect(result).toEqual({
      ok: false,
      message:
        "REFUSED keep the Preview credential only in ignored .env.local, never as an argument",
    });
    if (result.ok) throw new Error("expected the positional value to be refused");
    expect(result.message).not.toContain(sentinel);
  });

  it.each([
    ["host", "postgresql://neondb_owner:synthetic@production.invalid/neondb"],
    [
      "database",
      `postgresql://neondb_owner:synthetic@${PREVIEW_DATABASE_HOST}/other`,
    ],
    [
      "role",
      `postgresql://other_role:synthetic@${PREVIEW_DATABASE_HOST}/neondb`,
    ],
    [
      "password",
      `postgresql://neondb_owner@${PREVIEW_DATABASE_HOST}/neondb`,
    ],
  ])("generically refuses the wrong %s without creating a client", (_case, databaseUrl) => {
    const result = resolveLiveRoomConfiguration(
      [previewTarget],
      () => `DATABASE_URL=${databaseUrl}`,
    );

    expect(result).toEqual({
      ok: false,
      message: "REFUSED ignored .env.local does not contain the expected Preview database",
    });
  });

  it("accepts the exact Preview shape without making an HTTP or SQL request", () => {
    let reads = 0;

    const result = resolveLiveRoomConfiguration([previewTarget], () => {
      reads++;
      return previewDatabase;
    });

    expect(result).toEqual({
      ok: true,
      origin: previewTarget,
      databaseUrl: previewDatabase.slice("DATABASE_URL=".length),
    });
    expect(reads).toBe(1);
  });
});
