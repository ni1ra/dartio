import { describe, expect, it } from "vitest";
import { clearDialogue, createDialogue, hear, pending, speaks, type DialogueState } from "./dialogue";

function sure(state: DialogueState, text: string, mode: Parameters<typeof hear>[2] = "x01") {
  return hear(state, text, mode, { confidence: 1 });
}

function unsure(state: DialogueState, text: string, mode: Parameters<typeof hear>[2] = "x01") {
  return hear(state, text, mode, { confidence: 0.3 });
}

describe("what happens to something it heard clearly", () => {
  it("applies a dart straight away", () => {
    const outcome = sure(createDialogue(), "treble twenty");
    expect(outcome).toMatchObject({ kind: "apply", command: { type: "dart", segment: 20, multiplier: 3 } });
  });

  it("says so when it did not understand at all", () => {
    expect(sure(createDialogue(), "pass me the crisps")).toMatchObject({ kind: "unheard" });
  });
});

describe("holding something it is not sure about", () => {
  it("queues a doubtful transcription instead of scoring it", () => {
    const outcome = unsure(createDialogue(), "treble twenty");

    expect(outcome.kind).toBe("queued");
    expect(pending(outcome.state)).toHaveLength(1);
  });

  it("applies the held command when the player confirms it", () => {
    const queued = unsure(createDialogue(), "treble twenty");
    const outcome = sure(queued.state, "yes");

    expect(outcome).toMatchObject({ kind: "confirmed", command: { type: "dart", segment: 20, multiplier: 3 } });
    expect(pending(outcome.state)).toHaveLength(0);
  });

  it("throws the held command away when the player rejects it", () => {
    const queued = unsure(createDialogue(), "treble twenty");
    const outcome = sure(queued.state, "no");

    expect(outcome).toMatchObject({ kind: "cancelled", text: "treble twenty" });
    expect(pending(outcome.state)).toHaveLength(0);
  });

  it("answers the oldest first, so two doubts do not resolve backwards", () => {
    let state = createDialogue();
    state = unsure(state, "treble twenty").state;
    state = unsure(state, "double sixteen").state;

    const first = sure(state, "confirm");
    expect(first).toMatchObject({ kind: "confirmed", command: { segment: 20, multiplier: 3 } });

    const second = sure(first.state, "confirm");
    expect(second).toMatchObject({ kind: "confirmed", command: { segment: 16, multiplier: 2 } });
  });

  it("does nothing when there is nothing to confirm", () => {
    // The old behaviour parsed these and dropped them; saying so is the fix.
    expect(sure(createDialogue(), "yes")).toMatchObject({ kind: "nothing-pending" });
    expect(sure(createDialogue(), "cancel")).toMatchObject({ kind: "nothing-pending" });
  });

  it("drops everything held when the match has moved on", () => {
    const queued = unsure(createDialogue(), "treble twenty");
    expect(pending(clearDialogue(queued.state))).toHaveLength(0);
  });
});

describe("each mode speaks its own vocabulary", () => {
  it("takes a visit total in X01 and nowhere else", () => {
    expect(sure(createDialogue(), "score sixty", "x01")).toMatchObject({ kind: "apply", command: { type: "turn_score", score: 60 } });

    for (const mode of ["cricket", "round", "drill"] as const) {
      expect(sure(createDialogue(), "score sixty", mode)).toMatchObject({ kind: "out-of-vocabulary" });
    }
  });

  it("has nobody to pass to in a drill", () => {
    expect(sure(createDialogue(), "next player", "drill")).toMatchObject({ kind: "out-of-vocabulary" });
    expect(sure(createDialogue(), "next player", "cricket")).toMatchObject({ kind: "apply" });
  });

  it("takes a dart in every mode, because every mode is thrown at the same board", () => {
    for (const mode of ["x01", "cricket", "round", "drill"] as const) {
      expect(sure(createDialogue(), "double sixteen", mode)).toMatchObject({ kind: "apply" });
    }
  });

  it("answers a control word in every mode, whatever else that mode refuses", () => {
    expect(speaks("drill", { type: "confirm" })).toBe(true);
    expect(speaks("drill", { type: "undo" })).toBe(true);
  });
});
