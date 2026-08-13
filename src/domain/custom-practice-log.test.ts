import { describe, expect, it } from "vitest";
import { dart } from "./darts";
import {
  appendCustomPracticeEvent,
  createCustomPracticeLog,
  customPracticeDartEvent,
  customPracticeMatchRecord,
  replayCustomPractice,
  undoLastCustomPracticeEvent,
} from "./custom-practice-log";

const targets = [
  { segment: 20, multiplier: 3 },
  { segment: 16, multiplier: 2 },
] as const;

describe("custom practice log", () => {
  it("replays and undoes without mutating the original log", () => {
    const empty = createCustomPracticeLog(targets);
    const once = appendCustomPracticeEvent(empty, customPracticeDartEvent(dart(20, 3, { x: 0, y: -0.6 })));
    const twice = appendCustomPracticeEvent(once, customPracticeDartEvent(dart(16, 2)));
    expect(replayCustomPractice(twice)).toMatchObject({ state: { status: "complete" }, rejected: [] });
    expect(undoLastCustomPracticeEvent(twice)).toEqual(once);
    expect(empty.events).toEqual([]);
  });

  it("reports trailing post-completion events instead of silently dropping them", () => {
    let log = createCustomPracticeLog([{ segment: 20, multiplier: 3 }]);
    log = appendCustomPracticeEvent(log, customPracticeDartEvent(dart(20, 3)));
    log = appendCustomPracticeEvent(log, customPracticeDartEvent(dart(1)));
    expect(replayCustomPractice(log).rejected).toEqual([1]);
  });

  it("records an unscored practice identity with running hits and exact darts", () => {
    let log = createCustomPracticeLog(targets);
    log = appendCustomPracticeEvent(log, customPracticeDartEvent(dart(20, 3)));
    log = appendCustomPracticeEvent(log, customPracticeDartEvent(dart(1)));
    log = appendCustomPracticeEvent(log, customPracticeDartEvent(dart(2)));
    log = appendCustomPracticeEvent(log, customPracticeDartEvent(dart(3)));
    expect(customPracticeMatchRecord(log)).toEqual({
      mode: "customPractice",
      options: { rulesVersion: 1, targets, hits: 1 },
      players: [{ seat: 0, displayName: "You", isBot: false }],
      turns: [
        expect.objectContaining({ turnNumber: 1, scoreBefore: 0, scoreAfter: 1, dartsThrown: 1 }),
        expect.objectContaining({ turnNumber: 2, scoreBefore: 1, scoreAfter: 1, dartsThrown: 3 }),
      ],
    });
  });
});
