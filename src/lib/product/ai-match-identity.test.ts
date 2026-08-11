import { describe, expect, it } from "vitest";
import { opponentSeatIdentity } from "./ai-match-identity";

describe("opponent match history identity", () => {
  it("records the one level used by a normal or initial-fallback AI match", () => {
    expect(opponentSeatIdentity(true, 20, [20])).toEqual({ isBot: true, botLevel: 20 });
    expect(opponentSeatIdentity(true, 20, [8])).toEqual({ isBot: true, botLevel: 8 });
  });

  it("does not invent one level after an explicit in-match continuation", () => {
    expect(opponentSeatIdentity(true, 8, [20, 8])).toEqual({ isBot: true });
    expect(opponentSeatIdentity(false, 8, [])).toEqual({ isBot: false });
  });
});
