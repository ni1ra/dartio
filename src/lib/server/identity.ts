export interface VerifiedIdentity { readonly subject: string; readonly email: string; readonly name?: string | null }
export interface InternalUser { readonly id: string; readonly authSubject: string; readonly email: string; readonly stripeCustomerId: string | null }
export interface UserIdentityStore {
  findBySubject(subject: string): Promise<InternalUser | null>;
  findByEmail(email: string): Promise<InternalUser | null>;
  create(identity: VerifiedIdentity): Promise<InternalUser>;
  updateEmail(id: string, email: string): Promise<InternalUser>;
}
export interface SessionReader { getIdentity(): Promise<VerifiedIdentity | null> }

export async function resolveVerifiedIdentity(reader: SessionReader, store: UserIdentityStore): Promise<InternalUser> {
  const identity = await reader.getIdentity();
  if (!identity) throw new AuthError();
  const normalized = { ...identity, subject: identity.subject.trim(), email: identity.email.trim().toLowerCase() };
  if (!normalized.subject || !normalized.email) throw new AuthError();

  const bySubject = await store.findBySubject(normalized.subject);
  if (bySubject) {
    if (bySubject.email === normalized.email) return bySubject;
    const emailOwner = await store.findByEmail(normalized.email);
    if (emailOwner && emailOwner.id !== bySubject.id) throw new IdentityConflictError();
    return store.updateEmail(bySubject.id, normalized.email);
  }
  if (await store.findByEmail(normalized.email)) throw new IdentityConflictError();
  try { return await store.create(normalized); }
  catch (error) {
    const raceWinner = await store.findBySubject(normalized.subject);
    if (raceWinner?.email === normalized.email) return raceWinner;
    if (await store.findByEmail(normalized.email)) throw new IdentityConflictError();
    throw error;
  }
}

export class AuthError extends Error { readonly status = 401; constructor() { super("Authentication required"); } }
export class IdentityConflictError extends Error { readonly status = 409; constructor() { super("This email is already linked to another identity"); } }
