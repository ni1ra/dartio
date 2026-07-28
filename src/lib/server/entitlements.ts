import type { Entitlement } from "@/lib/billing/catalog";
import { AccessServiceError, getAccessForUser, type AccessSnapshot, type SubscriptionReader } from "./access";
import { requireCurrentUser } from "./auth";
import { AuthError, AuthServiceError, type InternalUser } from "./identity";

export class EntitlementRequiredError extends Error {
  readonly status = 402;

  constructor(readonly entitlement: Entitlement) {
    super("Paid entitlement required");
    this.name = "EntitlementRequiredError";
  }
}

export async function requireEntitlement(
  entitlement: Entitlement,
  options: {
    readonly requireUser?: () => Promise<InternalUser>;
    readonly reader?: SubscriptionReader;
    readonly now?: Date;
  } = {},
): Promise<{ readonly user: InternalUser; readonly access: AccessSnapshot }> {
  const user = await (options.requireUser ?? requireCurrentUser)();
  const access = await getAccessForUser(user, { reader: options.reader, now: options.now });
  if (!access.entitlements.includes(entitlement)) throw new EntitlementRequiredError(entitlement);
  return { user, access };
}

export function safeEntitlementError(
  error: unknown,
  fallback: string,
): { readonly status: 401 | 402 | 500 | 503; readonly body: { readonly error: string; readonly required?: Entitlement } } {
  if (error instanceof AuthError) return { status: 401, body: { error: "authentication_required" } };
  if (error instanceof EntitlementRequiredError) return { status: 402, body: { error: "upgrade_required", required: error.entitlement } };
  if (error instanceof AuthServiceError || error instanceof AccessServiceError) return { status: 503, body: { error: "access_status_unavailable" } };
  return { status: 500, body: { error: fallback } };
}
