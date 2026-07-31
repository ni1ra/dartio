import { getNeonAuth } from "@/lib/server/auth";
import { recordFailure } from "@/lib/server/observability";

type Context = { params: Promise<{ path: string[] }> };
type Verb = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type Handler = (request: Request, context: Context) => Promise<Response> | Response;

const NO_STORE = { "Cache-Control": "private, no-store", "content-type": "application/json" };

/**
 * Degrades honestly when Neon Auth's own service cannot be reached.
 *
 * `/api/auth/get-session` answered 500 when the upstream was unreachable, where
 * every route Dartio owns answers a deliberate 503. The difference matters: a 500
 * says Dartio is broken, a 503 says an authority is temporarily unavailable, and
 * only the second is true during a Neon outage. The access client already treats
 * 503 as "carry on with local free play", which is the right outcome — nothing
 * about scoring a match needs an account.
 *
 * Nothing else is touched. A refusal the auth service means — a wrong password, an
 * untrusted origin — is its answer to give and passes through unchanged.
 */
export async function proxyAuthRequest(
  verb: Verb,
  request: Request,
  context: Context,
  resolve: (verb: Verb) => Handler = (name) => getNeonAuth().handler()[name],
): Promise<Response> {
  let path = "unknown";
  try {
    path = (await context.params).path.join("/");
  } catch {
    // A malformed route is not an outage; let the handler answer for it.
  }
  try {
    const response = await resolve(verb)(request, context);
    // A 500 from upstream is the same outage seen one step further away.
    if (response.status === 500) {
      recordFailure("auth.upstream_error", new Error("upstream returned 500"), { route: `auth/${path}`, status: 503 });
      return unavailable();
    }
    return response;
  } catch (cause) {
    recordFailure("auth.unreachable", cause, { route: `auth/${path}`, status: 503 });
    return unavailable();
  }
}

function unavailable(): Response {
  return new Response(JSON.stringify({ error: "auth_service_unavailable" }), { status: 503, headers: NO_STORE });
}

export function GET(request: Request, context: Context) { return proxyAuthRequest("GET", request, context); }
export function POST(request: Request, context: Context) { return proxyAuthRequest("POST", request, context); }
export function PUT(request: Request, context: Context) { return proxyAuthRequest("PUT", request, context); }
export function DELETE(request: Request, context: Context) { return proxyAuthRequest("DELETE", request, context); }
export function PATCH(request: Request, context: Context) { return proxyAuthRequest("PATCH", request, context); }
