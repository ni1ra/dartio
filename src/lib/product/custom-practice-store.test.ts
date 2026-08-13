import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendCustomPracticeEvent, createCustomPracticeLog, customPracticeDartEvent, dart } from "@/domain";
import {
  clearCustomPractice,
  customPracticeResumeKey,
  loadCustomPractice,
  saveCustomPractice,
} from "./custom-practice-store";

const targets = [{ segment: 20, multiplier: 3 }, { segment: 16, multiplier: 2 }] as const;
let storage: Storage;

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("window", { localStorage: storage });
});
afterEach(() => vi.unstubAllGlobals());

function active() {
  return appendCustomPracticeEvent(createCustomPracticeLog(targets), customPracticeDartEvent(dart(1)));
}

function storedEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    storageVersion: 1,
    rulesVersion: 1,
    scope: { path: "T20.D16" },
    log: { version: 1, targets, events: [{ kind: "dart", segment: 1, multiplier: 1 }] },
    ...overrides,
  };
}

describe("custom practice resume", () => {
  it("round-trips a strict path-scoped envelope", () => {
    const log = active();
    saveCustomPractice(log);
    expect(loadCustomPractice(targets)).toEqual(log);
    expect(JSON.parse(storage.getItem(customPracticeResumeKey(targets))!)).toMatchObject({
      storageVersion: 1,
      rulesVersion: 1,
      scope: { path: "T20.D16" },
      log: { version: 1, targets },
    });
  });

  it.each([
    storedEnvelope({ log: { version: 1, targets, events: [{ kind: "dart", segment: 25, multiplier: 3 }] } }),
    storedEnvelope({ scope: { path: "D20.D16" } }),
    storedEnvelope({ log: { version: 1, targets, events: [{ kind: "dart", segment: 1, multiplier: 1, extra: true }] } }),
    storedEnvelope({ log: { version: 1, targets, events: [{ kind: "dart", segment: 1, multiplier: 1, x: 0.2 }] } }),
    storedEnvelope({ log: { version: 1, targets, events: Array.from({ length: 37 }, () => ({ kind: "dart", segment: 1, multiplier: 1 })) } }),
  ])("removes a known corrupt envelope %#", (value) => {
    const key = customPracticeResumeKey(targets);
    storage.setItem(key, JSON.stringify(value));
    expect(loadCustomPractice(targets)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it.each([
    storedEnvelope({ storageVersion: 2 }),
    storedEnvelope({ rulesVersion: 2 }),
    storedEnvelope({ log: { version: 2, targets, events: [] } }),
  ])("preserves future version boundaries byte-for-byte %#", (value) => {
    const key = customPracticeResumeKey(targets);
    const raw = `${JSON.stringify(value)}\n`;
    storage.setItem(key, raw);
    expect(loadCustomPractice(targets)).toBeNull();
    expect(storage.getItem(key)).toBe(raw);
  });

  it.each([
    { events: [{ kind: "dart", segment: 20, multiplier: 3 }] },
    { events: [{ kind: "dart", segment: 20, multiplier: 3 }, { kind: "dart", segment: 1, multiplier: 1 }] },
  ])("removes completed and trailing-event logs on load %#", ({ events }) => {
    const oneTarget = [{ segment: 20, multiplier: 3 }] as const;
    const key = customPracticeResumeKey(oneTarget);
    storage.setItem(key, JSON.stringify({
      storageVersion: 1,
      rulesVersion: 1,
      scope: { path: "T20" },
      log: { version: 1, targets: oneTarget, events },
    }));
    expect(loadCustomPractice(oneTarget)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it("clears only the exact path on an explicit empty transition", () => {
    saveCustomPractice(active());
    const other = [{ segment: 20, multiplier: 2 }] as const;
    saveCustomPractice(appendCustomPracticeEvent(createCustomPracticeLog(other), customPracticeDartEvent(dart(1))));
    saveCustomPractice(createCustomPracticeLog(targets));
    expect(storage.getItem(customPracticeResumeKey(targets))).toBeNull();
    expect(storage.getItem(customPracticeResumeKey(other))).not.toBeNull();
  });

  it("contains localStorage getter and operation failures", () => {
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get: () => { throw new DOMException("denied", "SecurityError"); } }));
    expect(loadCustomPractice(targets)).toBeNull();
    expect(() => saveCustomPractice(active())).not.toThrow();
    expect(() => clearCustomPractice(targets)).not.toThrow();
  });
});
