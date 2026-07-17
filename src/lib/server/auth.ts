import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { users } from "@/db/schema";
import { getAuthEnv } from "@/lib/env/server";
import { resolveVerifiedIdentity, type InternalUser, type SessionReader, type UserIdentityStore } from "./identity";
export { AuthError, IdentityConflictError } from "./identity";

let singleton: NeonAuth | undefined;

export function getNeonAuth(): NeonAuth {
  if (!singleton) {
    const env = getAuthEnv();
    singleton = createNeonAuth({ baseUrl: env.NEON_AUTH_BASE_URL, cookies: { secret: env.NEON_AUTH_COOKIE_SECRET } });
  }
  return singleton;
}

export async function requireCurrentUser(): Promise<InternalUser> { return resolveVerifiedIdentity(neonSessionReader, databaseUserStore()); }

const neonSessionReader: SessionReader = {
  async getIdentity() {
    const { data } = await getNeonAuth().getSession();
    const user = data?.user;
    return user?.id && user.email ? { subject: user.id, email: user.email, name: user.name } : null;
  },
};

function databaseUserStore(): UserIdentityStore {
  const db = createDatabase();
  const columns = { id: users.id, authSubject: users.authSubject, email: users.email, stripeCustomerId: users.stripeCustomerId };
  return {
    async findBySubject(subject) { return (await db.select(columns).from(users).where(eq(users.authSubject, subject)).limit(1))[0] ?? null; },
    async findByEmail(email) { return (await db.select(columns).from(users).where(eq(users.email, email)).limit(1))[0] ?? null; },
    async create(identity) { return (await db.insert(users).values({ authSubject: identity.subject, email: identity.email }).returning(columns))[0]!; },
    async updateEmail(id, email) { return (await db.update(users).set({ email, updatedAt: new Date() }).where(eq(users.id, id)).returning(columns))[0]!; },
  };
}
