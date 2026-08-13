import { describe, expect, it } from "vitest";
import { parseVoiceCommand } from "./commands";

describe("voice command parsing", () => {
  it.each([["treble twenty", { type: "dart", segment: 20, multiplier: 3 }], ["hit D16", { type: "dart", segment: 16, multiplier: 2 }], ["dart t 19", { type: "dart", segment: 19, multiplier: 3 }], ["miss", { type: "dart", segment: 0, multiplier: 1 }], ["bullseye", { type: "dart", segment: 25, multiplier: 2 }], ["outer bull", { type: "dart", segment: 25, multiplier: 1 }], ["tops", { type: "dart", segment: 20, multiplier: 2 }], ["score 140", { type: "turn_score", score: 140 }], ["turn one eighty", { type: "turn_score", score: 180 }], ["i scored one hundred and forty", { type: "turn_score", score: 140 }], ["single twenty-five", { type: "dart", segment: 25, multiplier: 1 }], ["take that back", { type: "undo" }]])("parses %s", (input, expected) => expect(parseVoiceCommand(input)).toEqual(expected));
  it.each(["triple bull", "score 181", "double 26", "single 21", "double 22", "treble 23", "24", "nonsense command"])("rejects %s", (input) => expect(parseVoiceCommand(input)).toBeNull());
});
