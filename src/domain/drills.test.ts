import { describe, expect, it } from "vitest";
import {
  applyDrillDart,
  createDrill,
  dart,
  drillSummary,
  drillTarget,
  DRILLS,
  type DrillState,
} from "@/domain";

function throwAll(state: DrillState, ...darts: readonly ReturnType<typeof dart>[]): DrillState {
  return darts.reduce((current, value) => applyDrillDart(current, value), state);
}

describe("Checkout Lab", () => {
  it("opens on the easiest finish in the ladder", () => {
    expect(drillTarget(createDrill("checkoutLab"))).toBe(40);
  });

  it("counts a finish that lands exactly, on a double", () => {
    const after = applyDrillDart(createDrill("checkoutLab"), dart(20, 2));

    expect(after.attempts).toHaveLength(1);
    expect(after.attempts[0]).toMatchObject({ target: 40, hit: true, scored: 1 });
    // One dart settled it; the drill does not make you throw at nothing.
    expect(after.attempts[0]?.darts).toHaveLength(1);
    expect(drillTarget(after)).toBe(32);
  });

  it("refuses a finish that lands on the right total but not on a double", () => {
    // Twenty then double ten is forty, but a single twenty last is not a finish.
    const after = throwAll(createDrill("checkoutLab"), dart(10, 2), dart(20, 1));
    expect(after.attempts[0]).toMatchObject({ hit: false, scored: 0 });
  });

  it("ends the attempt when the score is overshot", () => {
    const after = applyDrillDart(createDrill("checkoutLab"), dart(20, 3));

    expect(after.attempts).toHaveLength(1);
    expect(after.attempts[0]).toMatchObject({ hit: false });
  });

  it("ends the attempt after three darts even when nothing settled it", () => {
    const after = throwAll(createDrill("checkoutLab"), dart(1, 1), dart(1, 1), dart(1, 1));
    expect(after.attempts).toHaveLength(1);
    expect(after.attempts[0]?.darts).toHaveLength(3);
  });
});

describe("Doubles Matrix", () => {
  it("walks every double and finishes on the bull", () => {
    expect(drillTarget(createDrill("doublesMatrix"))).toBe(1);
    expect(DRILLS.doublesMatrix.attempts).toBe(21);
    expect(DRILLS.doublesMatrix.target(20)).toBe(25);
  });

  it("takes the attempt on the dart that hits, not on the third", () => {
    const after = throwAll(createDrill("doublesMatrix"), dart(5, 1), dart(1, 2));

    expect(after.attempts[0]).toMatchObject({ target: 1, hit: true, scored: 1 });
    expect(after.attempts[0]?.darts).toHaveLength(2);
  });

  it("does not accept the single or the treble of the number", () => {
    const after = throwAll(createDrill("doublesMatrix"), dart(1, 1), dart(1, 3), dart(1, 1));
    expect(after.attempts[0]).toMatchObject({ hit: false, scored: 0 });
  });
});

describe("Scoring Sprint", () => {
  it("aims at nothing in particular and counts everything", () => {
    const state = createDrill("scoringSprint");
    expect(drillTarget(state)).toBeNull();

    const after = throwAll(state, dart(20, 3), dart(20, 1), dart(5, 1));
    expect(after.attempts[0]).toMatchObject({ target: null, scored: 85, hit: true });
  });

  it("calls a visit under sixty a miss without discarding its points", () => {
    const after = throwAll(createDrill("scoringSprint"), dart(1, 1), dart(1, 1), dart(1, 1));
    expect(after.attempts[0]).toMatchObject({ hit: false, scored: 3 });
  });

  it("runs for ten visits and then stops", () => {
    let state = createDrill("scoringSprint");
    for (let visit = 0; visit < 10; visit += 1) {
      state = throwAll(state, dart(20, 1), dart(20, 1), dart(20, 1));
    }

    expect(state.status).toBe("complete");
    expect(state.attempts).toHaveLength(10);
    expect(() => applyDrillDart(state, dart(20, 1))).toThrow(/finished/);
  });
});

describe("what a drill reports", () => {
  it("summarises attempts, hits, and the running total in the drill's own unit", () => {
    let state = createDrill("doublesMatrix");
    state = applyDrillDart(state, dart(1, 2));
    state = throwAll(state, dart(3, 1), dart(3, 1), dart(3, 1));

    expect(drillSummary(state)).toEqual({
      attempts: 2,
      hits: 1,
      hitPercentage: 50,
      total: 1,
      dartsThrown: 4,
      unit: "doubles",
    });
  });

  it("reads an untouched drill as empty rather than as a perfect score", () => {
    expect(drillSummary(createDrill("checkoutLab"))).toMatchObject({ attempts: 0, hits: 0, hitPercentage: 0, total: 0 });
  });

  it("counts the darts of a visit still in progress", () => {
    const state = applyDrillDart(createDrill("scoringSprint"), dart(20, 1));
    expect(drillSummary(state).dartsThrown).toBe(1);
  });

  it("refuses a drill nobody wrote", () => {
    expect(() => createDrill("nonsense" as never)).toThrow(/Unknown drill/);
  });
});
