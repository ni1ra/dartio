import { describe, expect, it } from "vitest";
import { applyDart, createX01, dart, undoLastDart } from "@/domain";

const players = [{ id: "a", name: "Ada" }, { id: "b", name: "Bert" }];
const options = { startingScore: 301, legsToWin: 1, setsToWin: 1, inRule: "straight", outRule: "double" } as const;

describe("X01", () => {
  it("applies three darts immutably then advances", () => {
    const start = createX01(options, players);
    const one = applyDart(start, dart(20, 3));
    const two = applyDart(one, dart(20, 3));
    const three = applyDart(two, dart(20, 3));
    expect(start.scores[0]).toBe(301);
    expect(three.scores[0]).toBe(121);
    expect(three.currentPlayer).toBe(1);
    expect(three.turns[0]?.darts).toHaveLength(3);
  });

  it("rolls a bust back to the start of the turn", () => {
    let state = createX01({ ...options, startingScore: 40 }, players);
    state = applyDart(state, dart(20));
    state = applyDart(state, dart(19));
    expect(state.scores[0]).toBe(40);
    expect(state.currentPlayer).toBe(1);
    expect(state.turns[0]?.bust).toBe(true);
  });

  it("requires double-in and double-out", () => {
    let state = createX01({ ...options, startingScore: 40, inRule: "double" }, players);
    state = applyDart(state, dart(20));
    expect(state.scores[0]).toBe(40);
    state = applyDart(state, dart(10, 2));
    expect(state.scores[0]).toBe(20);
    state = applyDart(state, dart(10, 2));
    expect(state.status).toBe("complete");
    expect(state.winnerId).toBe("a");
  });

  it("undoes exactly one dart including a completed match", () => {
    const start = createX01({ ...options, startingScore: 40 }, players);
    const complete = applyDart(start, dart(20, 2));
    const restored = undoLastDart(complete);
    expect(restored.status).toBe("playing");
    expect(restored.scores[0]).toBe(40);
    expect(restored.past).toHaveLength(0);
  });

  it("allows one remaining and S1 under straight-out rules", () => {
    let state = createX01({ ...options, startingScore: 2, outRule: "straight" }, players);
    state = applyDart(state, dart(1));
    expect(state.scores[0]).toBe(1);
    state = applyDart(state, dart(1));
    expect(state.status).toBe("complete");
  });
  it("rotates the next leg from the prior starter, not the winner", () => {
    const three = [...players, { id: "c", name: "Cora" }];
    let state = createX01({ ...options, startingScore: 2, legsToWin: 3 }, three);
    for (let turn = 0; turn < 2; turn++) for (let throwIndex = 0; throwIndex < 3; throwIndex++) state = applyDart(state, dart(0));
    expect(state.currentPlayer).toBe(2);
    state = applyDart(state, dart(1, 2));
    expect(state.status).toBe("playing");
    expect(state.currentPlayer).toBe(1);
    expect(state.legStarter).toBe(1);
  });
});
