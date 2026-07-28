import { NextResponse } from "next/server";
import { z } from "zod";
import { AiTurnAccessError, generateAuthorizedAiTurn } from "@/lib/server/ai-turn";
import { AccessServiceError, getCurrentAccess, type AccessSnapshot } from "@/lib/server/access";
import { getCurrentUser } from "@/lib/server/auth";
import { AuthServiceError } from "@/lib/server/identity";

const NO_STORE = { "Cache-Control": "private, no-store" };
const bodySchema = z.object({
  level: z.number().int().min(9).max(20),
  score: z.number().int().min(1).max(9999),
  opened: z.boolean(),
  inRule: z.enum(["straight", "double", "master"]),
  outRule: z.enum(["straight", "double", "master"]),
}).strict().refine(
  (value) => value.score !== 1 || (value.outRule === "straight" && (value.opened || value.inRule === "straight")),
  { message: "Score 1 requires an opened straight-out game" },
);

export interface AiTurnRouteDependencies {
  readonly resolveAccess?: () => Promise<AccessSnapshot>;
  readonly random?: () => number;
}

export async function handleAiTurnRequest(
  request: Request,
  dependencies: AiTurnRouteDependencies = {},
): Promise<Response> {
  try {
    const input = bodySchema.parse(await request.json());
    const resolveAccess = dependencies.resolveAccess
      ?? (() => getCurrentAccess({ resolveUser: getCurrentUser }));
    const access = await resolveAccess();
    const darts = generateAuthorizedAiTurn(input, access, dependencies.random);
    return NextResponse.json({ darts }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "invalid_ai_turn" }, { status: 400, headers: NO_STORE });
    }
    if (error instanceof AiTurnAccessError) {
      const body = error.code === "advanced_ai_required"
        ? { error: error.code, maxLevel: 8 }
        : { error: error.code };
      return NextResponse.json(body, { status: error.status, headers: NO_STORE });
    }
    if (error instanceof AccessServiceError || error instanceof AuthServiceError) {
      return NextResponse.json({ error: "access_status_unavailable" }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ error: "ai_turn_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleAiTurnRequest(request);
}
