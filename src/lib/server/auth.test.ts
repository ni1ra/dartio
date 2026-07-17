import { describe, expect, it, vi } from "vitest";
import {
  AuthError,
  AuthServiceError,
  IdentityConflictError,
  normalizeIdentity,
  resolveVerifiedIdentity,
  sessionStateFromAuthResult,
  type InternalUser,
  type NormalizedIdentity,
  type SessionReader,
  type SessionState,
  type UserIdentityStore,
} from "./identity";

class MemoryIdentities implements UserIdentityStore {
  private readonly usersBySubject = new Map<string, InternalUser>();
  private readonly subjectByEmail = new Map<string, string>();
  private nextId = 1;

  async resolve(identity: NormalizedIdentity): Promise<InternalUser> {
    const emailOwner = this.subjectByEmail.get(identity.email);
    if (emailOwner && emailOwner !== identity.subject) throw new IdentityConflictError();

    const existing = this.usersBySubject.get(identity.subject);
    if (existing) {
      if (existing.email !== identity.email) {
        this.subjectByEmail.delete(existing.email);
        this.subjectByEmail.set(identity.email, identity.subject);
      }
      const updated = { ...existing, email: identity.email };
      this.usersBySubject.set(identity.subject, updated);
      return updated;
    }

    const id = `user-${this.nextId++}`;
    const user: InternalUser = {
      id,
      authSubject: identity.subject,
      email: identity.email,
      stripeCustomerId: null,
      profile: {
        userId: id,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        preferences: {},
      },
    };
    this.usersBySubject.set(identity.subject, user);
    this.subjectByEmail.set(identity.email, identity.subject);
    return user;
  }
}

const reader = (state: SessionState): SessionReader => ({ async read() { return state; } });
const authenticated = (overrides: Partial<NormalizedIdentity> = {}): SessionState => ({
  status: "authenticated",
  identity: {
    subject: overrides.subject ?? "auth-1",
    email: overrides.email ?? "lain@example.com",
    name: overrides.displayName,
    avatarUrl: overrides.avatarUrl,
  },
});

describe("Neon session states", () => {
  it("maps an authenticated Neon session without using the external subject as an internal id", () => {
    const state = sessionStateFromAuthResult({
      data: { user: { id: "auth-subject", email: "lain@example.com", name: "lain", image: "https://example.com/lain.png" } },
      error: null,
    });
    expect(state).toEqual({
      status: "authenticated",
      identity: { subject: "auth-subject", email: "lain@example.com", name: "lain", avatarUrl: "https://example.com/lain.png" },
    });
  });

  it("distinguishes signed-out, malformed, and upstream-error results", () => {
    expect(sessionStateFromAuthResult({ data: null, error: null })).toEqual({ status: "signed-out" });
    expect(sessionStateFromAuthResult({ data: { user: { id: "", email: "" } }, error: null }).status).toBe("error");
    expect(sessionStateFromAuthResult({ data: null, error: { code: "NETWORK_TIMEOUT" } }).status).toBe("error");
  });
});

describe("durable Dartio identity resolution", () => {
  it("rejects signed-out sessions explicitly", async () => {
    await expect(resolveVerifiedIdentity(reader({ status: "signed-out" }), new MemoryIdentities())).rejects.toBeInstanceOf(AuthError);
  });

  it("turns returned and thrown session failures into an explicit service error", async () => {
    await expect(resolveVerifiedIdentity(reader({ status: "error", cause: new Error("timeout") }), new MemoryIdentities())).rejects.toBeInstanceOf(AuthServiceError);
    await expect(resolveVerifiedIdentity({ async read() { throw new Error("network down"); } }, new MemoryIdentities())).rejects.toBeInstanceOf(AuthServiceError);
  });

  it("normalizes email, display name, and safe avatar URLs", () => {
    expect(normalizeIdentity({
      subject: " auth-1 ",
      email: " LAIN@EXAMPLE.COM ",
      name: "  Lain   Iwakura  ",
      avatarUrl: "https://example.com/avatar.png",
    })).toEqual({
      subject: "auth-1",
      email: "lain@example.com",
      displayName: "Lain Iwakura",
      avatarUrl: "https://example.com/avatar.png",
    });
    expect(normalizeIdentity({ subject: "auth-2", email: "PLAYER@EXAMPLE.COM", avatarUrl: "javascript:alert(1)" })).toMatchObject({
      displayName: "player",
      avatarUrl: null,
    });
  });

  it("rejects malformed authenticated claims before persistence", async () => {
    const resolve = vi.fn();
    await expect(resolveVerifiedIdentity(reader(authenticated({ subject: "   " })), { resolve })).rejects.toBeInstanceOf(AuthServiceError);
    await expect(resolveVerifiedIdentity(reader(authenticated({ email: "   " })), { resolve })).rejects.toBeInstanceOf(AuthServiceError);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("creates one internal UUID boundary and profile idempotently under concurrent resolution", async () => {
    const store = new MemoryIdentities();
    const [first, second, third] = await Promise.all([
      resolveVerifiedIdentity(reader(authenticated({ subject: " auth-1 ", email: "LAIN@EXAMPLE.COM", displayName: "lain" })), store),
      resolveVerifiedIdentity(reader(authenticated({ subject: "auth-1", email: "lain@example.com", displayName: "lain" })), store),
      resolveVerifiedIdentity(reader(authenticated({ subject: "auth-1", email: "lain@example.com", displayName: "lain" })), store),
    ]);
    expect(new Set([first.id, second.id, third.id])).toEqual(new Set(["user-1"]));
    expect(first.id).not.toBe(first.authSubject);
    expect(first.profile).toMatchObject({ userId: first.id, displayName: "lain", preferences: {} });
  });

  it("updates the normalized email but does not overwrite a durable profile from provider metadata", async () => {
    const store = new MemoryIdentities();
    const initial = await resolveVerifiedIdentity(reader(authenticated({ displayName: "Initial name" })), store);
    const updated = await resolveVerifiedIdentity(reader(authenticated({ email: "NEW@EXAMPLE.COM", displayName: "Provider changed" })), store);
    expect(updated).toMatchObject({ id: initial.id, email: "new@example.com", profile: { displayName: "Initial name" } });
  });

  it("never links two external subjects to one normalized email", async () => {
    const store = new MemoryIdentities();
    await resolveVerifiedIdentity(reader(authenticated({ subject: "auth-1", email: "SAME@example.com" })), store);
    await expect(resolveVerifiedIdentity(reader(authenticated({ subject: "auth-2", email: "same@EXAMPLE.com" })), store)).rejects.toBeInstanceOf(IdentityConflictError);
  });
});
