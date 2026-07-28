export interface VerifiedIdentity {
  readonly subject: string;
  readonly email: string;
  readonly name?: string | null;
  readonly avatarUrl?: string | null;
}

export interface NormalizedIdentity {
  readonly subject: string;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

export interface InternalProfile {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly preferences: Record<string, unknown>;
}

export interface InternalUser {
  readonly id: string;
  readonly authSubject: string;
  readonly email: string;
  readonly stripeCustomerId: string | null;
  readonly profile: InternalProfile;
}

export type SessionState =
  | { readonly status: "authenticated"; readonly identity: VerifiedIdentity }
  | { readonly status: "signed-out" }
  | { readonly status: "error"; readonly cause?: unknown };

export interface AuthSessionResult {
  readonly data?: {
    readonly user?: {
      readonly id?: string | null;
      readonly email?: string | null;
      readonly name?: string | null;
      readonly image?: string | null;
    } | null;
  } | null;
  readonly error?: unknown | null;
}

export interface SessionReader {
  read(): Promise<SessionState>;
}

export interface UserIdentityStore {
  resolve(identity: NormalizedIdentity): Promise<InternalUser>;
}

export function sessionStateFromAuthResult(result: AuthSessionResult): SessionState {
  if (result.error) return { status: "error", cause: result.error };
  const user = result.data?.user;
  if (!user) return { status: "signed-out" };
  if (!user.id || !user.email) return { status: "error" };
  return {
    status: "authenticated",
    identity: { subject: user.id, email: user.email, name: user.name, avatarUrl: user.image },
  };
}

export async function resolveVerifiedIdentity(reader: SessionReader, store: UserIdentityStore): Promise<InternalUser> {
  let session: SessionState;
  try {
    session = await reader.read();
  } catch (cause) {
    throw new AuthServiceError({ cause });
  }

  if (session.status === "signed-out") throw new AuthError();
  if (session.status === "error") throw new AuthServiceError({ cause: session.cause });
  return store.resolve(normalizeIdentity(session.identity));
}

export function normalizeIdentity(identity: VerifiedIdentity): NormalizedIdentity {
  const subject = identity.subject.trim();
  const email = identity.email.trim().toLowerCase();
  if (!subject || !email) throw new AuthServiceError();

  const suppliedName = identity.name?.trim().replace(/\s+/g, " ");
  const emailName = email.split("@", 1)[0]?.trim();
  const displayName = (suppliedName || emailName || "Player").slice(0, 80);
  return { subject, email, displayName, avatarUrl: normalizeAvatarUrl(identity.avatarUrl) };
}

function normalizeAvatarUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export class AuthError extends Error {
  readonly status = 401;
  constructor() {
    super("Authentication required");
    this.name = "AuthError";
  }
}

export class AuthServiceError extends Error {
  readonly status = 503;
  constructor(options?: ErrorOptions) {
    super("Authentication service unavailable", options);
    this.name = "AuthServiceError";
  }
}

export class IdentityConflictError extends Error {
  readonly status = 409;
  constructor(options?: ErrorOptions) {
    super("This email is already linked to another identity", options);
    this.name = "IdentityConflictError";
  }
}
