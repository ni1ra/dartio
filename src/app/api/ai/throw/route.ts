import { NextResponse } from "next/server";
import { z } from "zod";
import type { BoardNumber } from "@/domain/darts";
import { AccessServiceError, getCurrentAccess, type AccessSnapshot } from "@/lib/server/access";
import { AiThrowAccessError, generateAuthorizedAiThrow } from "@/lib/server/ai-throw";
import { getCurrentUser } from "@/lib/server/auth";
import { AuthServiceError } from "@/lib/server/identity";

const NO_STORE = { "Cache-Control": "private, no-store" };
const segmentSchema = z.number().int()
  .refine((value) => value === 25 || (value >= 1 && value <= 20), "Not a scoring bed")
  .transform((value) => value as BoardNumber);
const targetSchema = z.object({
  segment: segmentSchema,
  multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
}).strict().refine(
  (target) => target.segment !== 25 || target.multiplier !== 3,
  "The bull has no treble bed",
);
const bodySchema = z.object({
  level: z.number().int().min(9).max(20),
  target: targetSchema,
}).strict();

export interface AiThrowRouteDependencies {
  readonly resolveAccess?: () => Promise<AccessSnapshot>;
  readonly random?: () => number;
}

export async function handleAiThrowRequest(
  request: Request,
  dependencies: AiThrowRouteDependencies = {},
): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_ai_throw" }, { status: 400, headers: NO_STORE });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_ai_throw" }, { status: 400, headers: NO_STORE });
  }

  try {
    const resolveAccess = dependencies.resolveAccess
      ?? (() => getCurrentAccess({ resolveUser: getCurrentUser }));
    const access = await resolveAccess();
    const dart = generateAuthorizedAiThrow(parsed.data, access, dependencies.random);
    return NextResponse.json({ dart }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AiThrowAccessError) {
      const body = error.code === "advanced_ai_required"
        ? { error: error.code, maxLevel: 8 }
        : { error: error.code };
      return NextResponse.json(body, { status: error.status, headers: NO_STORE });
    }
    if (error instanceof AccessServiceError || error instanceof AuthServiceError) {
      return NextResponse.json({ error: "access_status_unavailable" }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ error: "ai_throw_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleAiThrowRequest(request);
}
