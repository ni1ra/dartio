import { z } from "zod";

export const accessEntitlements = [
  "local_scoring",
  "basic_checkout",
  "advanced_checkout",
  "online_multiplayer",
  "voice_always_on",
  "advanced_ai",
  "deep_stats",
  "custom_practice",
  "club_management",
] as const;

export type AccessEntitlement = (typeof accessEntitlements)[number];
export type AccessPlan = "free" | "pro" | "club";
export type AvailabilityState = "implemented" | "coming_soon";

const availabilitySchema = z.object({
  localScoring: z.enum(["implemented", "coming_soon"]),
  advancedAi: z.enum(["implemented", "coming_soon"]),
  advancedCheckout: z.enum(["implemented", "coming_soon"]),
  voiceInput: z.enum(["implemented", "coming_soon"]),
  history: z.enum(["implemented", "coming_soon"]),
  deepStats: z.enum(["implemented", "coming_soon"]),
  onlineMultiplayer: z.enum(["implemented", "coming_soon"]),
  customPractice: z.enum(["implemented", "coming_soon"]),
  clubManagement: z.enum(["implemented", "coming_soon"]),
}).strict();

export const accessSnapshotSchema = z.object({
  auth: z.enum(["anonymous", "authenticated"]),
  effectivePlan: z.enum(["free", "pro", "club"]),
  accessState: z.enum(["free", "active", "grace"]),
  accessEndsAt: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  entitlements: z.array(z.enum(accessEntitlements)),
  limits: z.object({
    aiMaxLevel: z.number().int().min(1).max(20),
    historyMatches: z.number().int().nonnegative().nullable(),
    onlineSeats: z.number().int().nonnegative(),
  }).strict(),
  availability: availabilitySchema,
}).strict();

export type AccessSnapshot = z.infer<typeof accessSnapshotSchema>;
export type AvailabilityKey = keyof AccessSnapshot["availability"];

export function parseAccessSnapshot(value: unknown): AccessSnapshot {
  return accessSnapshotSchema.parse(value);
}

export function hasAccessEntitlement(snapshot: AccessSnapshot, entitlement: AccessEntitlement): boolean {
  return snapshot.entitlements.includes(entitlement);
}

export function isProductAvailable(snapshot: AccessSnapshot, feature: AvailabilityKey): boolean {
  return snapshot.availability[feature] === "implemented";
}

export function hasPaidMembership(snapshot: AccessSnapshot): boolean {
  return (snapshot.effectivePlan === "pro" || snapshot.effectivePlan === "club")
    && (snapshot.accessState === "active" || snapshot.accessState === "grace");
}
