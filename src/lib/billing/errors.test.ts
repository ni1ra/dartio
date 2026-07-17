import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AuthError, IdentityConflictError } from "@/lib/server/identity";
import { BillingPublicError, safeBillingError } from "./errors";

describe("safe billing errors", () => {
  it("uses a closed public vocabulary for expected request and identity failures", () => {
    expect(safeBillingError(new z.ZodError([]), "fallback")).toEqual({ status: 400, error: "Invalid request" });
    expect(safeBillingError(new SyntaxError("secret parser detail"), "fallback")).toEqual({ status: 400, error: "Invalid request" });
    expect(safeBillingError(new AuthError(), "fallback")).toEqual({ status: 401, error: "Authentication required" });
    expect(safeBillingError(new IdentityConflictError(), "fallback")).toEqual({ status: 409, error: "Account identity conflict" });
    expect(safeBillingError(new BillingPublicError(404, "No billing account"), "fallback")).toEqual({ status: 404, error: "No billing account" });
  });

  it("never reflects Stripe, database, or configuration exception messages", () => {
    expect(safeBillingError(Object.assign(new Error("sk_test_leaked database host"), { status: 402 }), "Unable to create checkout")).toEqual({ status: 500, error: "Unable to create checkout" });
  });
});
