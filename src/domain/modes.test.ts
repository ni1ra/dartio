import { describe, expect, it } from "vitest";
import { GAME_MODES, modeName } from "./modes";

describe("stored mode names", () => {
  it("uses the ids the three playable drill records actually persist", () => {
    expect(GAME_MODES.checkoutLab).toMatchObject({ name: "Checkout Lab", status: "playable" });
    expect(GAME_MODES.doublesMatrix).toMatchObject({ name: "Doubles Matrix", status: "playable" });
    expect(GAME_MODES.scoringSprint).toMatchObject({ name: "Scoring Sprint", status: "playable" });
    expect(modeName("checkoutLab")).toBe("Checkout Lab");
    expect(modeName("doublesMatrix")).toBe("Doubles Matrix");
    expect(modeName("scoringSprint")).toBe("Scoring Sprint");
    expect(GAME_MODES.customPractice).toMatchObject({ name: "Custom Practice", status: "playable" });
    expect(modeName("customPractice")).toBe("Custom Practice");
  });

  it("keeps a future stored id readable", () => {
    expect(modeName("future-mode")).toBe("future-mode");
  });
});
