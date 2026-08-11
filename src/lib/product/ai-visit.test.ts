import { describe, expect, it, vi } from "vitest";
import type { Aim } from "@/domain/ai-throw";
import { dart, type Dart } from "@/domain/darts";
import { AiVisitSequenceError, collectAiVisit, type AiVisitRules } from "./ai-visit";

interface State {
  readonly thrown: number;
  readonly finished?: boolean;
}

function rules(limit = 3): AiVisitRules<State> {
  return {
    continues: (state) => !state.finished && state.thrown < limit,
    boundary: () => 0,
    target: (state) => ({ segment: (state.thrown + 1) as 1 | 2 | 3, multiplier: 1 }),
    apply: (state) => ({ ...state, thrown: state.thrown + 1 }),
  };
}

function sampler(values: readonly Dart[]) {
  let index = 0;
  return vi.fn(async (target: Aim, signal: AbortSignal) => {
    // The fake ignores execution details, but retaining the real signature lets
    // the assertions prove the collector supplies both dependencies.
    void target;
    void signal;
    return values[index++]!;
  });
}

describe("collectAiVisit", () => {
  it("chooses every target from the preceding landing's temporary state", async () => {
    const controller = new AbortController();
    const sample = sampler([dart(20, 1), dart(19, 1), dart(18, 1)]);
    const chosen: number[] = [];
    const visitRules = rules();

    const result = await collectAiVisit({
      initial: { thrown: 0 },
      signal: controller.signal,
      sample: async (target, signal) => {
        chosen.push(target.segment);
        return sample(target, signal);
      },
      rules: visitRules,
    });

    expect(chosen).toEqual([1, 2, 3]);
    expect(result).toHaveLength(3);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns an early finish without asking for spare darts", async () => {
    const controller = new AbortController();
    const sample = sampler([dart(20, 2)]);
    const result = await collectAiVisit({
      initial: { thrown: 0 },
      signal: controller.signal,
      sample,
      rules: rules(1),
    });

    expect(result).toHaveLength(1);
    expect(sample).toHaveBeenCalledTimes(1);
  });

  it("rejects the whole projection when the second request fails", async () => {
    const controller = new AbortController();
    const initial: State = Object.freeze({ thrown: 0 });
    let request = 0;

    await expect(collectAiVisit({
      initial,
      signal: controller.signal,
      rules: rules(),
      sample: async () => {
        request += 1;
        if (request === 2) throw new Error("network down");
        return dart(20, 1);
      },
    })).rejects.toThrow("network down");

    expect(initial).toEqual({ thrown: 0 });
    expect(request).toBe(2);
  });

  it("observes cancellation before applying a returned landing", async () => {
    const controller = new AbortController();
    const apply = vi.fn((state: State) => ({ ...state, thrown: state.thrown + 1 }));

    await expect(collectAiVisit({
      initial: { thrown: 0 },
      signal: controller.signal,
      rules: { ...rules(), apply },
      sample: async () => {
        controller.abort();
        return dart(20, 1);
      },
    })).rejects.toMatchObject({ name: "AbortError" });

    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses a reducer that does not settle a visit within three darts", async () => {
    const controller = new AbortController();
    await expect(collectAiVisit({
      initial: { thrown: 0 },
      signal: controller.signal,
      sample: sampler([dart(20, 1), dart(20, 1), dart(20, 1)]),
      rules: {
        continues: () => true,
        boundary: () => 0,
        target: () => ({ segment: 20, multiplier: 3 }),
        apply: (state) => ({ ...state, thrown: state.thrown + 1 }),
      },
    })).rejects.toBeInstanceOf(AiVisitSequenceError);
  });

  it("stops when a settled leg gives the same seat the next throw", async () => {
    const controller = new AbortController();
    const sample = sampler([dart(20, 2), dart(20, 2)]);
    const result = await collectAiVisit({
      initial: { thrown: 0 },
      signal: controller.signal,
      sample,
      rules: {
        continues: () => true,
        boundary: (state) => state.thrown,
        target: () => ({ segment: 20, multiplier: 2 }),
        apply: (state) => ({ ...state, thrown: state.thrown + 1 }),
      },
    });

    expect(result).toHaveLength(1);
    expect(sample).toHaveBeenCalledTimes(1);
  });
});
