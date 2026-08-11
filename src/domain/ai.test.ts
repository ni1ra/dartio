import { describe, expect, it } from "vitest";
import { aiSpread, applyDart, chooseX01Aim, createX01, generateAiVisit, seededRandom, throwAiDart } from "@/domain";

describe("AI levels", () => {
  it("has strictly improving measured accuracy from 1 through 20", () => {
    const means = Array.from({ length: 20 }, (_, index) => {
      const rng = seededRandom(5519);
      const errors = Array.from({ length: 2000 }, () => throwAiDart(index + 1, { segment: 20, multiplier: 3 }, rng).radialError);
      return errors.reduce((a, b) => a + b, 0) / errors.length;
    });
    for (let i = 1; i < means.length; i++) expect(means[i]).toBeLessThan(means[i - 1]!);
    expect(aiSpread(20)).toBeLessThan(aiSpread(1) / 4);
  });

  it("replays identically from a seed while producing misses", () => {
    const a = seededRandom(42); const b = seededRandom(42);
    const first = Array.from({ length: 20 }, () => throwAiDart(8, { segment: 20, multiplier: 3 }, a).dart.score);
    const second = Array.from({ length: 20 }, () => throwAiDart(8, { segment: 20, multiplier: 3 }, b).dart.score);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBeGreaterThan(2);
  });

  it("generates a three-dart visit that replays through X01 exactly", () => {
    const darts = generateAiVisit(20, {
      score: 301,
      opened: true,
      inRule: "straight",
      outRule: "double",
    }, () => 1);
    let state = createX01({
      startingScore: 301,
      legsToWin: 1,
      setsToWin: 1,
      inRule: "straight",
      outRule: "double",
    }, [{ id: "ai", name: "AI" }]);
    for (const value of darts) state = applyDart(state, value);

    expect(darts).toHaveLength(3);
    expect(darts.every((value) => typeof value.x === "number" && typeof value.y === "number")).toBe(true);
    expect(state.scores[0]).toBe(121);
    expect(state.turns[0]?.darts).toEqual(darts);
  });

  it("stops after a one-dart legal finish", () => {
    const darts = generateAiVisit(20, {
      score: 40,
      opened: true,
      inRule: "straight",
      outRule: "double",
    }, () => 1);

    expect(darts).toHaveLength(1);
    expect(darts[0]).toMatchObject({ segment: 20, multiplier: 2, score: 40 });
  });

  it("stops immediately when the generated dart busts the visit", () => {
    // A novice does not plan: it throws its biggest number and busts from 3.
    const darts = generateAiVisit(3, {
      score: 3,
      opened: true,
      inRule: "straight",
      outRule: "double",
    }, () => 1);

    expect(darts).toHaveLength(1);
    expect(darts[0]).toMatchObject({ segment: 20, multiplier: 3, score: 60 });
  });

  it("a tactical level plays the route out of 3 instead of busting on it", () => {
    const darts = generateAiVisit(20, {
      score: 3,
      opened: true,
      inRule: "straight",
      outRule: "double",
    }, () => 1);

    // S1 then D1 is the only double-out from 3, and an expert takes it.
    expect(darts.length).toBeGreaterThan(1);
    expect(darts[0]).toMatchObject({ segment: 1, multiplier: 1 });
  });

  it("uses the production X01 chooser for opening and checkout policy", () => {
    const expert = createX01({
      startingScore: 135,
      legsToWin: 1,
      setsToWin: 1,
      inRule: "straight",
      outRule: "double",
    }, [{ id: "ai", name: "AI" }]);
    const doubleIn = createX01({
      startingScore: 301,
      legsToWin: 1,
      setsToWin: 1,
      inRule: "double",
      outRule: "double",
    }, [{ id: "ai", name: "AI" }]);
    const masterIn = createX01({
      startingScore: 301,
      legsToWin: 1,
      setsToWin: 1,
      inRule: "master",
      outRule: "double",
    }, [{ id: "ai", name: "AI" }]);

    expect(chooseX01Aim(expert, 0, 20)).toEqual({ segment: 25, multiplier: 2 });
    expect(chooseX01Aim(doubleIn, 0, 20)).toEqual({ segment: 20, multiplier: 2 });
    expect(chooseX01Aim(masterIn, 0, 20)).toEqual({ segment: 20, multiplier: 3 });
  });

  it("keeps throwing without scoring until a double-in is proven", () => {
    const darts = generateAiVisit(20, {
      score: 301,
      opened: false,
      inRule: "double",
      outRule: "double",
    }, () => 1);

    let state = createX01({
      startingScore: 301,
      legsToWin: 1,
      setsToWin: 1,
      inRule: "double",
      outRule: "double",
    }, [{ id: "ai", name: "AI" }]);
    for (const value of darts) state = applyDart(state, value);

    expect(darts).toHaveLength(3);
    expect(darts[0]).toMatchObject({ segment: 20, multiplier: 2, score: 40 });
    expect(state.opened[0]).toBe(true);
    expect(state.scores[0]).toBe(141);
  });

  it("uses treble twenty as a legal master-in opener", () => {
    const darts = generateAiVisit(20, {
      score: 301,
      opened: false,
      inRule: "master",
      outRule: "double",
    }, () => 1);

    expect(darts[0]).toMatchObject({ segment: 20, multiplier: 3, score: 60 });
  });

  it("finishes one remaining under straight-out and replays through X01", () => {
    const options = {
      startingScore: 4,
      legsToWin: 1,
      setsToWin: 1,
      inRule: "straight",
      outRule: "straight",
    } as const;
    let state = createX01(options, [{ id: "ai", name: "AI" }]);
    state = applyDart(state, { segment: 1, multiplier: 1, score: 1 });
    state = applyDart(state, { segment: 1, multiplier: 1, score: 1 });
    state = applyDart(state, { segment: 1, multiplier: 1, score: 1 });
    expect(state.scores[0]).toBe(1);

    const darts = generateAiVisit(20, {
      score: 1,
      opened: true,
      inRule: "straight",
      outRule: "straight",
    }, () => 1);
    for (const value of darts) state = applyDart(state, value);

    expect(darts).toEqual([expect.objectContaining({ segment: 1, multiplier: 1, score: 1 })]);
    expect(state).toMatchObject({ status: "complete", scores: [0] });
  });

  it("aims the exact single for a straight-out score through twenty", () => {
    const darts = generateAiVisit(20, {
      score: 17,
      opened: true,
      inRule: "straight",
      outRule: "straight",
    }, () => 1);

    expect(darts).toEqual([expect.objectContaining({ segment: 17, multiplier: 1, score: 17 })]);
  });

  it("uses the same treble as a bust under double-out and a finish under master-out", () => {
    // Pinned to a novice level: the point of this case is the out rule, and a
    // tactical level would route around the bust rather than walk into it.
    const context = { score: 60, opened: true, inRule: "straight" } as const;
    const doubleDarts = generateAiVisit(3, { ...context, outRule: "double" }, () => 1);
    const masterDarts = generateAiVisit(3, { ...context, outRule: "master" }, () => 1);
    let doubleState = createX01({ ...context, startingScore: 60, legsToWin: 1, setsToWin: 1, outRule: "double" }, [{ id: "ai", name: "AI" }]);
    let masterState = createX01({ ...context, startingScore: 60, legsToWin: 1, setsToWin: 1, outRule: "master" }, [{ id: "ai", name: "AI" }]);
    for (const value of doubleDarts) doubleState = applyDart(doubleState, value);
    for (const value of masterDarts) masterState = applyDart(masterState, value);

    expect(doubleDarts).toHaveLength(1);
    expect(masterDarts).toHaveLength(1);
    expect(doubleState).toMatchObject({ status: "playing", scores: [60] });
    expect(doubleState.turns[0]?.bust).toBe(true);
    expect(masterState).toMatchObject({ status: "complete", scores: [0] });
  });

  it("rejects invalid transient visit scores", () => {
    expect(() => generateAiVisit(9, {
      score: 1,
      opened: true,
      inRule: "straight",
      outRule: "double",
    }, Math.random)).toThrow("AI visit score 1 requires an opened straight-out game");
  });
});
