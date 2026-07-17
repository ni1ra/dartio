import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { createPostgresIdentityStore } from "@/db/identity";
import { getAuthEnv } from "@/lib/env/server";
import {
  resolveVerifiedIdentity,
  sessionStateFromAuthResult,
  type InternalUser,
  type SessionReader,
} from "./identity";

export { AuthError, AuthServiceError, IdentityConflictError } from "./identity";

let singleton: NeonAuth | undefined;

export function getNeonAuth(): NeonAuth {
  if (!singleton) {
    const env = getAuthEnv();
    singleton = createNeonAuth({
      baseUrl: env.NEON_AUTH_BASE_URL,
      cookies: { secret: env.NEON_AUTH_COOKIE_SECRET },
    });
  }
  return singleton;
}

export async function requireCurrentUser(): Promise<InternalUser> {
  return resolveVerifiedIdentity(neonSessionReader, createPostgresIdentityStore());
}

const neonSessionReader: SessionReader = {
  async read() {
    return sessionStateFromAuthResult(await getNeonAuth().getSession());
  },
};
