import { z } from "zod";
import { AuthError, IdentityConflictError } from "@/lib/server/identity";

export class BillingPublicError extends Error {
  constructor(readonly status: 400 | 404 | 409, readonly publicMessage: string) { super(publicMessage); }
}

export function safeBillingError(error: unknown, fallback: string): { status: number; error: string } {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return { status: 400, error: "Invalid request" };
  if (error instanceof AuthError) return { status: 401, error: "Authentication required" };
  if (error instanceof IdentityConflictError) return { status: 409, error: "Account identity conflict" };
  if (error instanceof BillingPublicError) return { status: error.status, error: error.publicMessage };
  return { status: 500, error: fallback };
}
