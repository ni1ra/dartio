import { NextResponse } from "next/server";
import { z } from "zod";
import { AccessServiceError, getCurrentAccess, type AccessSnapshot } from "@/lib/server/access";
import { getCurrentUser } from "@/lib/server/auth";
import { CheckoutAdviceAccessError, generateAuthorizedCheckoutAdvice } from "@/lib/server/checkout-advice";
import {
  CHECKOUT_PERSONALIZATION_HISTORY_LIMIT,
  checkoutPersonalizationOff,
  checkoutPersonalizationUnavailable,
  deriveCheckoutPersonalization,
} from "@/lib/server/checkout-personalization";
import { AuthServiceError } from "@/lib/server/identity";
import { MatchHistoryError, readStatMatches } from "@/lib/server/match-history";

const NO_STORE = { "Cache-Control": "private, no-store" };

// Consent is the only personalization input the browser controls. The server
// owns both access and the match rows used to derive any route preferences.
const bodySchema = z.object({
  score: z.number().int().min(1).max(180),
  dartsAvailable: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  outRule: z.enum(["straight", "double", "master"]),
  personalize: z.boolean(),
}).strict();

export interface CheckoutAdviceContext {
  readonly access: AccessSnapshot;
  readonly userId: string | null;
}

export interface CheckoutAdviceRouteDependencies {
  readonly resolveContext?: () => Promise<CheckoutAdviceContext>;
  readonly readMatches?: typeof readStatMatches;
}

export async function handleCheckoutAdviceRequest(
  request: Request,
  dependencies: CheckoutAdviceRouteDependencies = {},
): Promise<Response> {
  try {
    const input = bodySchema.parse(await request.json());
    const context = await (dependencies.resolveContext ?? resolveCheckoutAdviceContext)();
    const standardAdvice = generateAuthorizedCheckoutAdvice({
      score: input.score,
      dartsAvailable: input.dartsAvailable,
      outRule: input.outRule,
      preferences: {},
    }, context.access);
    if (!input.personalize) {
      return NextResponse.json({
        advice: standardAdvice,
        personalization: checkoutPersonalizationOff(),
      }, { headers: NO_STORE });
    }

    // An authenticated access snapshot always has the same resolved user id in
    // production. Treat an inconsistent dependency as unavailable, never as a
    // reason to read another account's rows.
    if (!context.userId) throw new AccessServiceError();
    let matches: Awaited<ReturnType<typeof readStatMatches>>;
    try {
      matches = await (dependencies.readMatches ?? readStatMatches)(
        context.userId,
        CHECKOUT_PERSONALIZATION_HISTORY_LIMIT,
      );
    } catch (error) {
      if (error instanceof MatchHistoryError) {
        return NextResponse.json({
          advice: standardAdvice,
          personalization: checkoutPersonalizationUnavailable(),
        }, { headers: NO_STORE });
      }
      throw error;
    }
    const personalization = deriveCheckoutPersonalization(matches);
    const advice = generateAuthorizedCheckoutAdvice({
      score: input.score,
      dartsAvailable: input.dartsAvailable,
      outRule: input.outRule,
      preferences: personalization.preferences,
    }, context.access);
    return NextResponse.json({ advice, personalization: personalization.receipt }, { headers: NO_STORE });
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

/** Resolves identity once so access and history ownership cannot drift apart. */
async function resolveCheckoutAdviceContext(): Promise<CheckoutAdviceContext> {
  const user = await getCurrentUser();
  return {
    userId: user?.id ?? null,
    access: await getCurrentAccess({ resolveUser: async () => user }),
  };
}
