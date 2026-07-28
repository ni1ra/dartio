import { z } from "zod";
import type { CheckoutAdvice, CheckoutPreferences, OutRule } from "@/domain";

const legalSegments = new Set([0, 25, ...Array.from({ length: 20 }, (_, index) => index + 1)]);

// The server owns the routes, but the client still validates them: a malformed
// or tampered response must fall back to the locally computed free route rather
// than render an illegal dart as professional advice.
const dartSchema = z.object({
  segment: z.number().int(),
  multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  score: z.number().int().min(0).max(60),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
}).strict().superRefine((value, context) => {
  const legalSegment = legalSegments.has(value.segment);
  const legalMultiplier = value.segment === 0
    ? value.multiplier === 1
    : value.segment === 25
      ? value.multiplier !== 3
      : true;
  if (!legalSegment || !legalMultiplier || value.score !== value.segment * value.multiplier) {
    context.addIssue({ code: "custom", message: "Invalid planned dart" });
  }
});

const reasonCodeSchema = z.enum([
  "professional-route", "ranked-checkout", "preferred-double", "preferred-treble",
  "bull-finish", "bogey-number", "next-visit-finish", "scoring-setup", "invalid-score", "no-route",
]);

const routeSchema = z.array(dartSchema).min(1).max(3);
const planSchema = z.object({
  darts: routeSchema,
  leave: z.number().int().min(0),
  reasonCodes: z.array(reasonCodeSchema),
  explanation: z.string().min(1).max(400),
}).strict();

const adviceSchema = z.object({
  score: z.number().int(),
  dartsAvailable: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  checkout: z.boolean(),
  bogey: z.boolean(),
  primary: routeSchema.nullable(),
  alternates: z.array(routeSchema).max(4),
  setup: routeSchema.nullable(),
  leave: z.number().int().nullable(),
  targetLeave: z.number().int().nullable(),
  reasonCodes: z.array(reasonCodeSchema),
  explanation: z.string().min(1).max(400),
  primaryPlan: planSchema.nullable(),
  alternatePlans: z.array(planSchema).max(4),
  setupPlan: planSchema.nullable(),
}).strict();

const successSchema = z.object({ advice: adviceSchema }).strict();
const errorSchema = z.object({
  error: z.enum([
    "invalid_checkout_request", "authentication_required", "advanced_checkout_required",
    "access_status_unavailable", "checkout_advice_failed",
  ]),
}).passthrough();

export interface AdvancedCheckoutRequest {
  readonly score: number;
  readonly dartsAvailable: 1 | 2 | 3;
  readonly outRule: OutRule;
  readonly preferences?: CheckoutPreferences;
}

export type CheckoutAdviceClientErrorCode =
  | z.infer<typeof errorSchema>["error"]
  | "invalid_response"
  | "network_error";

export class CheckoutAdviceClientError extends Error {
  constructor(
    readonly code: CheckoutAdviceClientErrorCode,
    readonly status: number | null,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "CheckoutAdviceClientError";
  }
}

export async function requestAdvancedCheckoutAdvice(
  input: AdvancedCheckoutRequest,
  options: { readonly signal?: AbortSignal; readonly fetcher?: typeof fetch } = {},
): Promise<CheckoutAdvice> {
  const fetcher = options.fetcher ?? fetch;
  const preferences = input.preferences ?? {};
  let response: Response;
  try {
    response = await fetcher("/api/checkout/advice", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        score: input.score,
        dartsAvailable: input.dartsAvailable,
        outRule: input.outRule,
        ...(preferences.preferredDoubles?.length ? { preferredDoubles: preferences.preferredDoubles } : {}),
        ...(preferences.preferredTrebles?.length ? { preferredTrebles: preferences.preferredTrebles } : {}),
        ...(preferences.avoidBull ? { avoidBull: true } : {}),
      }),
      signal: options.signal,
    });
  } catch (cause) {
    if (options.signal?.aborted || (cause instanceof DOMException && cause.name === "AbortError")) throw cause;
    throw new CheckoutAdviceClientError("network_error", null, { cause });
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(payload);
    throw new CheckoutAdviceClientError(parsed.success ? parsed.data.error : "checkout_advice_failed", response.status);
  }
  const parsed = successSchema.safeParse(payload);
  if (!parsed.success) throw new CheckoutAdviceClientError("invalid_response", response.status);
  // The schema mirrors CheckoutAdvice field-for-field; the cast only restores
  // the domain's narrower segment/multiplier literal types.
  return parsed.data.advice as CheckoutAdvice;
}
