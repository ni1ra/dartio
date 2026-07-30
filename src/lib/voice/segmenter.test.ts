import { describe, expect, it } from "vitest";
import {
  createSegmenter,
  DEFAULT_SEGMENTER,
  frameLevel,
  observeLevel,
  type SegmenterEvent,
  type SegmenterState,
} from "./segmenter";

const LOUD = 0.2;
const QUIET = 0.005;

/** Feeds a script of [loudness, millisecond] readings and collects what came back. */
function run(script: readonly (readonly [number, number])[], from: SegmenterState = createSegmenter()) {
  let state = from;
  const events: SegmenterEvent[] = [];
  for (const [rms, at] of script) {
    const step = observeLevel(state, rms, at);
    state = step.state;
    if (step.event.kind !== "none") events.push(step.event);
  }
  return { state, events };
}

describe("hearing somebody start and stop", () => {
  it("says nothing at all about a quiet room", () => {
    const { events } = run([[QUIET, 0], [QUIET, 100], [QUIET, 5000]]);
    expect(events).toEqual([]);
  });

  it("notices speech starting, and closes the clip once the room goes quiet", () => {
    const { events } = run([
      [QUIET, 0],
      [LOUD, 100], [LOUD, 400], [LOUD, 900],
      [QUIET, 1000], [QUIET, 1400], [QUIET, 1800],
    ]);

    expect(events[0]).toEqual({ kind: "speech-started" });
    expect(events[1]).toMatchObject({ kind: "clip", reason: "silence" });
  });

  it("ends the clip where the talking stopped, not where the silence was noticed", () => {
    // Speech to 900ms, quiet from 1000ms, closed at 1800ms. The clip must not carry
    // the 800ms of pause that ended it.
    const { events } = run([
      [LOUD, 100], [LOUD, 900],
      [QUIET, 1000], [QUIET, 1800],
    ]);

    expect(events[1]).toMatchObject({ kind: "clip", startedAt: 100, endedAt: 1000 });
  });

  it("keeps a clip open through a pause shorter than the silence window", () => {
    const { events } = run([
      [LOUD, 0],
      [QUIET, 100], [QUIET, 400],
      [LOUD, 500], [LOUD, 900],
      [QUIET, 1000], [QUIET, 1800],
    ]);

    // One clip, not two: "treble" pause "twenty" is one thing somebody said.
    expect(events.filter((event) => event.kind === "clip")).toHaveLength(1);
    expect(events.filter((event) => event.kind === "speech-started")).toHaveLength(1);
  });

  it("throws away a noise too short to be a score", () => {
    // A dart hitting the board is loud and over in a moment.
    const { events } = run([
      [LOUD, 0], [LOUD, 50],
      [QUIET, 100], [QUIET, 900],
    ]);

    expect(events).toEqual([{ kind: "speech-started" }, { kind: "discarded" }]);
  });

  it("cuts a clip at the ceiling rather than recording forever", () => {
    const script: (readonly [number, number])[] = [];
    for (let at = 0; at <= DEFAULT_SEGMENTER.maxClipMs; at += 250) script.push([LOUD, at]);
    const { events } = run(script);

    expect(events.at(-1)).toMatchObject({ kind: "clip", reason: "length" });
  });

  it("re-arms itself after every clip, which is what makes it continuous", () => {
    const { state, events } = run([
      [LOUD, 0], [LOUD, 400],
      [QUIET, 500], [QUIET, 1300],
      [LOUD, 2000], [LOUD, 2400],
      [QUIET, 2500], [QUIET, 3300],
    ]);

    expect(events.filter((event) => event.kind === "clip")).toHaveLength(2);
    // And it is left ready rather than needing to be asked again.
    expect(state).toEqual(createSegmenter());
  });
});

describe("measuring a frame", () => {
  it("reads silence as zero and a full-scale tone as one", () => {
    expect(frameLevel(new Float32Array(128))).toBe(0);
    expect(frameLevel(new Float32Array(128).fill(1))).toBeCloseTo(1, 10);
  });

  it("is not fooled by a waveform being symmetrical about zero", () => {
    // A mean would read this as silence; loudness is not the average of a signal.
    const alternating = Float32Array.from({ length: 64 }, (_, index) => (index % 2 === 0 ? 0.5 : -0.5));
    expect(frameLevel(alternating)).toBeCloseTo(0.5, 10);
  });

  it("reads an empty frame as silence rather than dividing by nothing", () => {
    expect(frameLevel([])).toBe(0);
  });
});
