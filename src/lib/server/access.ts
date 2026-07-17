import { eq } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { isPaidPlanId, PLAN_CATALOG, type Entitlement, type PlanId } from "@/lib/billing/catalog";
import { subscriptionAccess, type StoredSubscriptionStatus } from "@/lib/billing/service";
import { PRODUCT_AVAILABILITY, type ProductAvailability } from "@/lib/product/availability";
import type { InternalUser } from "./identity";

export interface StoredAccessSubscription {
  readonly plan: unknown;
  readonly status: StoredSubscriptionStatus;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAt: Date | null;
  readonly cancelAtPeriodEnd: boolean;
}

export interface SubscriptionReader {
  findForUser(userId: string): Promise<StoredAccessSubscription | null>;
}

export interface AccessSnapshot {
  readonly auth: "anonymous" | "authenticated";
  readonly effectivePlan: PlanId;
  readonly accessState: "free" | "active" | "grace";
  readonly accessEndsAt: string | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly entitlements: readonly Entitlement[];
  readonly limits: {
    readonly aiMaxLevel: number;
    readonly historyMatches: number | null;
    readonly onlineSeats: number;
  };
  readonly availability: ProductAvailability;
}

export class AccessServiceError extends Error {
  readonly status = 503;

  constructor(options?: ErrorOptions) {
    super("Access status unavailable", options);
    this.name = "AccessServiceError";
  }
}

export function accessSnapshot(
  authenticated: boolean,
  stored: StoredAccessSubscription | null,
  now = new Date(),
): AccessSnapshot {
  const validStored = stored && isPaidPlanId(stored.plan)
    ? { ...stored, plan: stored.plan }
    : null;
  const access = subscriptionAccess(validStored, now);
  const policy = PLAN_CATALOG[access.plan];

  return {
    auth: authenticated ? "authenticated" : "anonymous",
    effectivePlan: access.plan,
    accessState: access.state === "inactive" ? "free" : access.state,
    accessEndsAt: access.accessEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: access.cancelAtPeriodEnd,
    entitlements: [...policy.entitlements],
    limits: {
      aiMaxLevel: policy.aiMaxLevel,
      historyMatches: policy.historyMatches,
      onlineSeats: policy.onlineSeats,
    },
    availability: PRODUCT_AVAILABILITY,
  };
}

export async function getAccessForUser(
  user: InternalUser,
  options: { readonly reader?: SubscriptionReader; readonly now?: Date } = {},
): Promise<AccessSnapshot> {
  const reader = options.reader ?? postgresSubscriptionReader;
  try {
    return accessSnapshot(true, await reader.findForUser(user.id), options.now);
  } catch (cause) {
    if (cause instanceof AccessServiceError) throw cause;
    throw new AccessServiceError({ cause });
  }
}

export async function getCurrentAccess(options: {
  readonly resolveUser: () => Promise<InternalUser | null>;
  readonly reader?: SubscriptionReader;
  readonly now?: Date;
}): Promise<AccessSnapshot> {
  const user = await options.resolveUser();
  if (!user) return accessSnapshot(false, null, options.now);
  return getAccessForUser(user, options);
}

const postgresSubscriptionReader: SubscriptionReader = {
  async findForUser(userId) {
    const db = createDatabase();
    return await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, userId),
      columns: {
        plan: true,
        status: true,
        currentPeriodEnd: true,
        cancelAt: true,
        cancelAtPeriodEnd: true,
      },
    }) ?? null;
  },
};
