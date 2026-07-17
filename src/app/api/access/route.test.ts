import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ getCurrentUser: vi.fn() }));
import { AuthServiceError } from "@/lib/server/identity";
import { AccessServiceError, accessSnapshot } from "@/lib/server/access";
import { handleAccessRequest } from "./route";

describe("GET /api/access", () => {
  it("returns a private no-store access snapshot", async () => {
    const response = await handleAccessRequest(async () => accessSnapshot(false, null));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({ auth: "anonymous", effectivePlan: "free" });
  });

  it.each([new AuthServiceError(), new AccessServiceError()])("returns 503 rather than Free when authority is indeterminate", async (failure) => {
    const response = await handleAccessRequest(async () => { throw failure; });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "access_status_unavailable" });
  });

  it("does not leak an unexpected server error", async () => {
    const response = await handleAccessRequest(async () => { throw new Error("SENSITIVE_CONFIG=redacted"); });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to resolve access" });
  });
});
