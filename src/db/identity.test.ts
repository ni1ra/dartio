import { describe, expect, it, vi } from "vitest";
import { createPostgresIdentityStore } from "./identity";

const identity = { subject: "auth-1", email: "lain@example.com", displayName: "lain", avatarUrl: null };
const row = {
  id: "8346b1c1-399a-4971-a449-4e85cf7a0e52",
  authSubject: "auth-1",
  email: "lain@example.com",
  stripeCustomerId: null,
  userId: "8346b1c1-399a-4971-a449-4e85cf7a0e52",
  displayName: "lain",
  avatarUrl: null,
  preferences: { checkoutHints: true },
};

describe("Postgres identity store", () => {
  it("maps the atomic user/profile query result", async () => {
    const execute = vi.fn(async () => [row]);
    const user = await createPostgresIdentityStore(execute).resolve(identity);
    expect(execute).toHaveBeenCalledWith(identity);
    expect(user).toEqual({
      id: row.id,
      authSubject: "auth-1",
      email: "lain@example.com",
      stripeCustomerId: null,
      profile: {
        userId: row.userId,
        displayName: "lain",
        avatarUrl: null,
        preferences: { checkoutHints: true },
      },
    });
  });

  it("maps a zero-row conditional upsert to an ownership conflict", async () => {
    await expect(createPostgresIdentityStore(async () => []).resolve(identity)).rejects.toMatchObject({ status: 409 });
  });

  it("maps direct and wrapped Postgres unique violations to an ownership conflict", async () => {
    const unique = Object.assign(new Error("duplicate"), { code: "23505" });
    await expect(createPostgresIdentityStore(async () => { throw unique; }).resolve(identity)).rejects.toMatchObject({ status: 409 });
    await expect(createPostgresIdentityStore(async () => { throw new Error("query failed", { cause: unique }); }).resolve(identity)).rejects.toMatchObject({ status: 409 });
  });

  it("preserves unrelated database failures", async () => {
    await expect(createPostgresIdentityStore(async () => { throw new Error("database unavailable"); }).resolve(identity)).rejects.toThrow("database unavailable");
  });
});
