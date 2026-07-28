import { NextResponse } from "next/server";
import { z } from "zod";
import type { BoardNumber } from "@/domain";
import { AccessServiceError, getCurrentAccess, type AccessSnapshot } from "@/lib/server/access";
import { getCurrentUser } from "@/lib/server/auth";
import { CheckoutAdviceAccessError, generateAuthorizedCheckoutAdvice } from "@/lib/server/checkout-advice";
import { AuthServiceError } from "@/lib/server/identity";

const NO_STORE = { "Cache-Control": "private, no-store" };

// Narrowed to the domain's BoardNumber union: 1–20 for trebles, plus the bull
// for doubles. 21–24 are not beds and must not survive validation.
const segmentSchema = z.number().int().min(1).max(20)
  .transform((value) => value as BoardNumber);
const doubleSegmentSchema = z.number().int()
  .refine((value) => value === 25 || (value >= 1 && value <= 20), "Not a scoring bed")
  .transform((value) => value as BoardNumber);

// Preferences are player taste, not authorization. The plan the request runs
// under comes from the server's own access snapshot; nothing here is trusted
// beyond the shape of the position being planned.
const bodySchema = z.object({
  score: z.number().int().min(1).max(180),
  dartsAvailable: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  outRule: z.enum(["straight", "double", "master"]),
  preferredDoubles: z.array(doubleSegmentSchema).max(21).optional(),
  preferredTrebles: z.array(segmentSchema).max(20).optional(),
  avoidBull: z.boolean().optional(),
}).strict();

export interface CheckoutAdviceRouteDependencies {
  readonly resolveAccess?: () => Promise<AccessSnapshot>;
}

export async function handleCheckoutAdviceRequest(
  request: Request,
  dependencies: CheckoutAdviceRouteDependencies = {},
): Promise<Response> {
  try {
    const input = bodySchema.parse(await request.json());
    const resolveAccess = dependencies.resolveAccess
      ?? (() => getCurrentAccess({ resolveUser: getCurrentUser }));
    const access = await resolveAccess();
    const advice = generateAuthorizedCheckoutAdvice({
      score: input.score,
      dartsAvailable: input.dartsAvailable,
      outRule: input.outRule,
      preferences: {
        preferredDoubles: input.preferredDoubles,
        preferredTrebles: input.preferredTrebles,
        avoidBull: input.avoidBull,
      },
    }, access);
    return NextResponse.json({ advice }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "invalid_checkout_request" }, { status: 400, headers: NO_STORE });
    }
    if (error instanceof CheckoutAdviceAccessError) {
      return NextResponse.json({ error: error.code }, { status: error.status, headers: NO_STORE });
    }
    if (error instanceof AccessServiceError || error instanceof AuthServiceError) {
      return NextResponse.json({ error: "access_status_unavailable" }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ error: "checkout_advice_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleCheckoutAdviceRequest(request);
}
