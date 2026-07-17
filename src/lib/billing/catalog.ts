export const ENTITLEMENTS = ["local_scoring", "basic_checkout", "online_multiplayer", "voice_always_on", "advanced_ai", "deep_stats", "custom_practice", "club_management"] as const;
export type Entitlement = (typeof ENTITLEMENTS)[number];
export type PlanId = "free" | "pro" | "club";
export type BillingInterval = "month" | "year";

export const PLAN_CATALOG = {
  free: { id: "free", name: "Free", monthlyCents: 0, annualCents: 0, trialDays: 0, checkout: "none", aiMaxLevel: 8, onlineSeats: 0, historyMatches: 50, entitlements: ["local_scoring", "basic_checkout"] },
  pro: { id: "pro", name: "Pro", monthlyCents: 799, annualCents: 7670, trialDays: 14, checkout: "self_serve", aiMaxLevel: 20, onlineSeats: 8, historyMatches: null, entitlements: ["local_scoring", "basic_checkout", "online_multiplayer", "voice_always_on", "advanced_ai", "deep_stats", "custom_practice"] },
  club: { id: "club", name: "Club", monthlyCents: 2400, annualCents: 23040, trialDays: 0, checkout: "contact", aiMaxLevel: 20, onlineSeats: 12, historyMatches: null, entitlements: [...ENTITLEMENTS] },
} as const satisfies Record<PlanId, { id: PlanId; name: string; monthlyCents: number; annualCents: number; trialDays: number; checkout: "none" | "self_serve" | "contact"; aiMaxLevel: number; onlineSeats: number; historyMatches: number | null; entitlements: readonly Entitlement[] }>;

export function hasEntitlement(plan: PlanId, entitlement: Entitlement): boolean { return PLAN_CATALOG[plan].entitlements.includes(entitlement as never); }
