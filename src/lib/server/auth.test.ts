import { describe, expect, it } from "vitest";
import { AuthError, IdentityConflictError, resolveVerifiedIdentity, type InternalUser, type SessionReader, type UserIdentityStore, type VerifiedIdentity } from "./identity";

class MemoryUsers implements UserIdentityStore {
  users: InternalUser[] = [];
  async findBySubject(subject: string) { return this.users.find((user) => user.authSubject === subject) ?? null; }
  async findByEmail(email: string) { return this.users.find((user) => user.email === email) ?? null; }
  async create(identity: VerifiedIdentity) { const user = { id: `user-${this.users.length + 1}`, authSubject: identity.subject, email: identity.email, stripeCustomerId: null }; this.users.push(user); return user; }
  async updateEmail(id: string, email: string) { const user = this.users.find((item) => item.id === id)!; const updated = { ...user, email }; this.users = this.users.map((item) => item.id === id ? updated : item); return updated; }
}
const reader = (identity: VerifiedIdentity | null): SessionReader => ({ async getIdentity() { return identity; } });

describe("verified Neon identity mapping", () => {
  it("rejects an absent session", async () => await expect(resolveVerifiedIdentity(reader(null), new MemoryUsers())).rejects.toBeInstanceOf(AuthError));
  it("normalizes and creates one internal user", async () => {
    const store = new MemoryUsers();
    const user = await resolveVerifiedIdentity(reader({ subject: " auth-1 ", email: "LAIN@EXAMPLE.COM" }), store);
    expect(user).toMatchObject({ authSubject: "auth-1", email: "lain@example.com" });
    expect((await resolveVerifiedIdentity(reader({ subject: "auth-1", email: "lain@example.com" }), store)).id).toBe(user.id);
  });
  it("updates email only when another identity does not own it", async () => {
    const store = new MemoryUsers();
    await resolveVerifiedIdentity(reader({ subject: "auth-1", email: "old@example.com" }), store);
    expect((await resolveVerifiedIdentity(reader({ subject: "auth-1", email: "new@example.com" }), store)).email).toBe("new@example.com");
    await resolveVerifiedIdentity(reader({ subject: "auth-2", email: "other@example.com" }), store);
    await expect(resolveVerifiedIdentity(reader({ subject: "auth-1", email: "other@example.com" }), store)).rejects.toBeInstanceOf(IdentityConflictError);
  });
  it("never links a new subject onto an existing email", async () => {
    const store = new MemoryUsers();
    await resolveVerifiedIdentity(reader({ subject: "auth-1", email: "same@example.com" }), store);
    await expect(resolveVerifiedIdentity(reader({ subject: "auth-2", email: "same@example.com" }), store)).rejects.toBeInstanceOf(IdentityConflictError);
  });
  it("preserves infrastructure failures that are not identity conflicts", async () => {
    const store = new MemoryUsers();
    store.create = async () => { throw new Error("database unavailable"); };
    await expect(resolveVerifiedIdentity(reader({ subject: "auth-1", email: "new@example.com" }), store)).rejects.toThrow("database unavailable");
  });
});
