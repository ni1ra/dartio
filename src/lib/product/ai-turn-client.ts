import { z } from "zod";
import { BOARD_RADII, type Dart, type InRule, type OutRule } from "@/domain";

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
  }
});
const successSchema = z.object({ darts: z.array(dartSchema).min(1).max(3) }).strict();
const errorSchema = z.object({
  error: z.enum(["invalid_ai_turn", "authentication_required", "advanced_ai_required", "access_status_unavailable", "ai_turn_failed"]),
  maxLevel: z.number().int().optional(),
}).passthrough();

export interface PremiumAiTurnRequest {
  readonly level: number;
  readonly score: number;
  readonly opened: boolean;
  readonly inRule: InRule;
  readonly outRule: OutRule;
}

export type AiTurnClientErrorCode =
  | "invalid_ai_turn"
  | "authentication_required"
  | "advanced_ai_required"
  | "access_status_unavailable"
  | "ai_turn_failed"
  | "invalid_response"
  | "network_error";

export class AiTurnClientError extends Error {
  constructor(
    readonly code: AiTurnClientErrorCode,
    readonly status: number | null,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "AiTurnClientError";
  }
}

export interface DartMarkerProjection {
  readonly x: number;
  readonly y: number;
  readonly offBoard: boolean;
  readonly capped: boolean;
}

export function projectDartMarker(
  value: Pick<Dart, "x" | "y">,
  visibleRimRadius = 1.06,
): DartMarkerProjection {
  const x = value.x ?? 0;
  const y = value.y ?? 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0, offBoard: true, capped: true };
  const radius = Math.hypot(x, y);
  const offBoard = radius > BOARD_RADII.outer;
  if (radius === 0 || radius <= visibleRimRadius) return { x, y, offBoard, capped: false };
  const scale = visibleRimRadius / radius;
  return { x: x * scale, y: y * scale, offBoard, capped: true };
}

export async function requestPremiumAiTurn(
  input: PremiumAiTurnRequest,
  options: { readonly signal?: AbortSignal; readonly fetcher?: typeof fetch } = {},
): Promise<readonly Dart[]> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/ai/turn", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: options.signal,
    });
  } catch (cause) {
    if (options.signal?.aborted || (cause instanceof DOMException && cause.name === "AbortError")) throw cause;
    throw new AiTurnClientError("network_error", null, { cause });
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(payload);
    throw new AiTurnClientError(parsed.success ? parsed.data.error : "ai_turn_failed", response.status);
  }
  const parsed = successSchema.safeParse(payload);
  if (!parsed.success) throw new AiTurnClientError("invalid_response", response.status);
  return parsed.data.darts as readonly Dart[];
}
