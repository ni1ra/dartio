import { z } from "zod";
import { scoreBoardPoint, type Dart } from "@/domain/darts";
import type { Aim } from "@/domain/ai-throw";

const legalSegments = new Set([0, 25, ...Array.from({ length: 20 }, (_, index) => index + 1)]);
const dartSchema = z.object({
  segment: z.number().int(),
  multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  score: z.number().int().min(0).max(60),
  x: z.number().finite(),
  y: z.number().finite(),
}).strict().superRefine((value, context) => {
  const legalSegment = legalSegments.has(value.segment);
  const legalMultiplier = value.segment === 0
    ? value.multiplier === 1
    : value.segment === 25
      ? value.multiplier !== 3
      : true;
  if (!legalSegment || !legalMultiplier || value.score !== value.segment * value.multiplier) {
    context.addIssue({ code: "custom", message: "Invalid scored dart" });
    return;
  }

  const scored = scoreBoardPoint({ x: value.x, y: value.y });
  if (
    scored.segment !== value.segment
    || scored.multiplier !== value.multiplier
    || scored.score !== value.score
  ) {
    context.addIssue({ code: "custom", message: "Dart coordinates disagree with its score" });
  }
});
const successSchema = z.object({ dart: dartSchema }).strict();
const errorSchema = z.discriminatedUnion("error", [
  z.object({ error: z.literal("invalid_ai_throw") }).strict(),
  z.object({ error: z.literal("authentication_required") }).strict(),
  z.object({
    error: z.literal("advanced_ai_required"),
    maxLevel: z.number().int().min(0).max(20),
  }).strict(),
  z.object({ error: z.literal("access_status_unavailable") }).strict(),
  z.object({ error: z.literal("ai_throw_failed") }).strict(),
]);

export interface PremiumAiThrowRequest {
  readonly level: number;
  readonly target: Aim;
}

export type AiThrowClientErrorCode =
  | "invalid_ai_throw"
  | "authentication_required"
  | "advanced_ai_required"
  | "access_status_unavailable"
  | "ai_throw_failed"
  | "invalid_response"
  | "network_error";

export class AiThrowClientError extends Error {
  constructor(
    readonly code: AiThrowClientErrorCode,
    readonly status: number | null,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "AiThrowClientError";
  }
}

/** Requests one server-authorized execution sample for a client-owned target. */
export async function requestPremiumAiThrow(
  input: PremiumAiThrowRequest,
  options: { readonly signal?: AbortSignal; readonly fetcher?: typeof fetch } = {},
): Promise<Dart> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/ai/throw", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      // Copy only contract fields so a wider runtime object cannot smuggle mode,
      // match, entitlement, plan, or seed claims across the boundary.
      body: JSON.stringify({
        level: input.level,
        target: {
          segment: input.target.segment,
          multiplier: input.target.multiplier,
        },
      }),
      signal: options.signal,
    });
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    throw new AiThrowClientError("network_error", null, { cause });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    payload = null;
  }

  if (!response.ok) {
    const parsed = errorSchema.safeParse(payload);
    throw new AiThrowClientError(
      parsed.success ? parsed.data.error : "ai_throw_failed",
      response.status,
    );
  }
  const parsed = successSchema.safeParse(payload);
  if (!parsed.success) throw new AiThrowClientError("invalid_response", response.status);
  return parsed.data.dart as Dart;
}

function isAbortError(cause: unknown): boolean {
  return typeof cause === "object"
    && cause !== null
    && "name" in cause
    && cause.name === "AbortError";
}
