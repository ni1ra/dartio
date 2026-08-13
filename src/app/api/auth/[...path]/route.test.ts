import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ getNeonAuth: vi.fn() }));
import { setObservabilitySink } from "@/lib/server/observability";
import { proxyAuthRequest } from "./route";

const context = { params: Promise.resolve({ path: ["get-session"] }) };
const request = new Request("https://dartio.test/api/auth/get-session");

afterEach(() => setObservabilitySink(null));

describe("the auth proxy during a Neon outage", () => {
  it("answers 503 rather than 500 when the auth service cannot be reached", async () => {
    const response = await proxyAuthRequest("GET", request, context, () => () => { throw new Error("fetch failed"); });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "auth_service_unavailable" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("treats a 500 from upstream as the same outage seen one step further away", async () => {
    const response = await proxyAuthRequest("GET", request, context, () => () => new Response("boom", { status: 500 }));
    expect(response.status).toBe(503);
  });

  it("records a fixed failure category without retaining the raw cause", async () => {
    const lines: unknown[] = [];
    setObservabilitySink((line) => lines.push(line));

    const response = await proxyAuthRequest("GET", request, context, () => () => { throw new Error("ECONNREFUSED 10.0.0.1"); });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: "auth.unreachable",
      severity: "error",
      route: "auth/get-session",
      status: 503,
      failure: "error",
    });
    expect(JSON.stringify(lines[0])).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(lines[0])).not.toContain("10.0.0.1");
    await expect(response.text()).resolves.not.toContain("ECONNREFUSED");
  });
});

describe("what the proxy does not touch", () => {
  it.each([
    ["a wrong password", 401],
    ["an untrusted origin", 403],
    ["a signed-in session", 200],
    ["a validation refusal", 400],
  ])("passes %s straight through", async (_label, status) => {
    const response = await proxyAuthRequest("POST", request, context, () => () => new Response("{}", { status }));
    expect(response.status).toBe(status);
  });

  it("hands the request and context to the verb it was asked for", async () => {
    const handler = vi.fn(() => new Response("{}", { status: 200 }));
    await proxyAuthRequest("PATCH", request, context, (verb) => {
      expect(verb).toBe("PATCH");
      return handler;
    });
    expect(handler).toHaveBeenCalledWith(request, context);
  });
});
