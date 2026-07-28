import { NextResponse } from "next/server";
import { AccessServiceError, getCurrentAccess, type AccessSnapshot } from "@/lib/server/access";
import { getCurrentUser } from "@/lib/server/auth";
import { AuthServiceError } from "@/lib/server/identity";

type AccessResolver = () => Promise<AccessSnapshot>;

export async function handleAccessRequest(
  resolveAccess: AccessResolver = () => getCurrentAccess({ resolveUser: getCurrentUser }),
): Promise<Response> {
  try {
    return NextResponse.json(await resolveAccess(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error instanceof AccessServiceError || error instanceof AuthServiceError ? 503 : 500;
    return NextResponse.json(
      { error: status === 503 ? "access_status_unavailable" : "Unable to resolve access" },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function GET(): Promise<Response> {
  return handleAccessRequest();
}
