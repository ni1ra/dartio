import { throwAiDart, type Aim } from "@/domain/ai-throw";
import type { Dart } from "@/domain/darts";
import type { AccessSnapshot } from "./access";

export interface PremiumAiThrowInput {
  readonly level: number;
  readonly target: Aim;
}

export type AiThrowAccessCode = "authentication_required" | "advanced_ai_required";

export class AiThrowAccessError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: AiThrowAccessCode,
  ) {
    super(code);
    this.name = "AiThrowAccessError";
  }
}

/**
 * Authorizes one premium execution sample without learning why a mode chose it.
 *
 * The access snapshot is canonical: neither level ceilings nor entitlement and
 * implementation claims are accepted from the request. Every refusal happens
 * before the random source is touched, so an unavailable feature cannot consume
 * even one generated throw.
 */
export function generateAuthorizedAiThrow(
  input: PremiumAiThrowInput,
  access: AccessSnapshot,
  random: () => number = Math.random,
): Dart {
  if (!Number.isInteger(input.level) || input.level < 9 || input.level > 20) {
    throw new RangeError("Premium AI level must be an integer from 9 to 20");
  }
  if (access.auth === "anonymous") {
    throw new AiThrowAccessError(401, "authentication_required");
  }
  if (
    !access.entitlements.includes("advanced_ai")
    || input.level > access.limits.aiMaxLevel
    || access.availability.advancedAi !== "implemented"
  ) {
    throw new AiThrowAccessError(403, "advanced_ai_required");
  }
  return throwAiDart(input.level, input.target, random).dart;
}
