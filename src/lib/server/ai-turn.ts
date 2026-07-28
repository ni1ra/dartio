import { generateAiVisit, type AiVisitContext, type Dart } from "@/domain";
import type { AccessSnapshot } from "./access";

export interface PremiumAiTurnInput extends AiVisitContext {
  readonly level: number;
}

export type AiTurnAccessCode = "authentication_required" | "advanced_ai_required";

export class AiTurnAccessError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: AiTurnAccessCode,
  ) {
    super(code);
    this.name = "AiTurnAccessError";
  }
}

export function generateAuthorizedAiTurn(
  input: PremiumAiTurnInput,
  access: AccessSnapshot,
  random: () => number = Math.random,
): readonly Dart[] {
  if (!Number.isInteger(input.level) || input.level < 9 || input.level > 20) {
    throw new RangeError("Premium AI level must be an integer from 9 to 20");
  }
  if (access.auth === "anonymous") {
    throw new AiTurnAccessError(401, "authentication_required");
  }
  if (input.level > access.limits.aiMaxLevel || !access.entitlements.includes("advanced_ai")) {
    throw new AiTurnAccessError(403, "advanced_ai_required");
  }
  return generateAiVisit(input.level, input, random);
}
