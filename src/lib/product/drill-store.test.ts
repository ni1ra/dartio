import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendDrillEvent,
  createDrillLog,
  dart,
  drillDartEvent,
  type DrillLog,
} from "@/domain";
import {
  clearDrillMatch,
  drillResumeKey,
  loadDrillMatch,
  saveDrillMatch,
} from "./drill-store";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const storage = new MemoryStorage();
const originalWindow = globalThis.window;

function active(drill: DrillLog["drill"]): DrillLog {
  return appendDrillEvent(createDrillLog(drill), drillDartEvent(dart(20, 3, { x: 0.1, y: -0.2 })));
}

function envelope(log: DrillLog): Record<string, unknown> {
  return {
    storageVersion: 1,
    rulesVersion: 1,
    scope: { drill: log.drill },
    log: { version: 1, ...log },
  };
}

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("window", { localStorage: storage });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalWindow === undefined) vi.unstubAllGlobals();
  else vi.stubGlobal("window", originalWindow);
});

describe("drill resume storage", () => {
  it.each(["checkoutLab", "doublesMatrix", "scoringSprint"] as const)(
    "round-trips a valid active %s log",
    (drill) => {
      const log = active(drill);
      saveDrillMatch(log);
      expect(loadDrillMatch(drill)).toEqual(log);
    },
  );

  it("round-trips an active drill through a strict versioned envelope", () => {
    const log = active("scoringSprint");
    saveDrillMatch(log);

    expect(loadDrillMatch("scoringSprint")).toEqual(log);
    expect(JSON.parse(storage.getItem(drillResumeKey("scoringSprint"))!)).toMatchObject({
      storageVersion: 1,
      rulesVersion: 1,
      scope: { drill: "scoringSprint" },
      log: { version: 1, drill: "scoringSprint" },
    });
  });

  it("migrates the unambiguous raw v1 drill only after the v2 write succeeds", () => {
    const oldKey = "dartio:drill-log:v1:doublesMatrix";
    const log = active("doublesMatrix");
    storage.setItem(oldKey, JSON.stringify(log));

    expect(loadDrillMatch("doublesMatrix")).toEqual(log);
    expect(storage.getItem(oldKey)).toBeNull();
    expect(storage.getItem(drillResumeKey("doublesMatrix"))).not.toBeNull();
  });

  it("keeps the legacy drill when quota prevents the migration write", () => {
    const oldKey = "dartio:drill-log:v1:doublesMatrix";
    storage.setItem(oldKey, JSON.stringify(active("doublesMatrix")));
    const setItem = vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key === drillResumeKey("doublesMatrix")) throw new DOMException("quota", "QuotaExceededError");
      MemoryStorage.prototype.setItem.call(storage, key, value);
    });

    expect(loadDrillMatch("doublesMatrix")).not.toBeNull();
    expect(setItem).toHaveBeenCalled();
    expect(storage.getItem(oldKey)).not.toBeNull();
  });

  it("cleans a known invalid legacy drill instead of retrying it forever", () => {
    const oldKey = "dartio:drill-log:v1:scoringSprint";
    storage.setItem(oldKey, JSON.stringify({ ...active("scoringSprint"), events: [] }));

    expect(loadDrillMatch("scoringSprint")).toBeNull();
    expect(storage.getItem(oldKey)).toBeNull();
  });

  it("preserves a future raw v1 drill byte-for-byte without writing v2", () => {
    const oldKey = "dartio:drill-log:v1:scoringSprint";
    const raw = `${JSON.stringify({ version: 4, ...active("scoringSprint") })}\n`;
    storage.setItem(oldKey, raw);

    expect(loadDrillMatch("scoringSprint")).toBeNull();
    expect(storage.getItem(oldKey)).toBe(raw);
    expect(storage.getItem(drillResumeKey("scoringSprint"))).toBeNull();
  });

  it("rejects cross-drill, extra-key, stale-rule, impossible, and partial-coordinate data", () => {
    const log = active("scoringSprint");
    const cases: readonly Record<string, unknown>[] = [
      { ...envelope(log), extra: true },
      { ...envelope(log), scope: { drill: "checkoutLab" } },
      { ...envelope(log), rulesVersion: 2 },
      { ...envelope(log), log: { version: 1, ...log, drill: "checkoutLab" } },
      { ...envelope(log), log: { version: 1, ...log, events: [{ kind: "dart", segment: 0, multiplier: 2 }] } },
      { ...envelope(log), log: { version: 1, ...log, events: [{ kind: "dart", segment: 25, multiplier: 3 }] } },
      { ...envelope(log), log: { version: 1, ...log, events: [{ kind: "dart", segment: 20, multiplier: 1, y: 0.2 }] } },
      { ...envelope(log), log: { version: 1, ...log, events: [{ kind: "dart", segment: 20, multiplier: 1, extra: true }] } },
    ];

    for (const value of cases) {
      storage.clear();
      storage.setItem(drillResumeKey("scoringSprint"), JSON.stringify(value));
      expect(loadDrillMatch("scoringSprint")).toBeNull();
    }
  });

  it("cleans malformed JSON and empty or oversized logs", () => {
    const key = drillResumeKey("scoringSprint");
    const log = active("scoringSprint");
    const cases: readonly (string | Record<string, unknown>)[] = [
      "{not-json",
      { ...envelope(log), log: { version: 1, ...log, events: [] } },
      { ...envelope(log), log: { version: 1, ...log, events: Array.from({ length: 5001 }, () => ({ kind: "dart", segment: 0, multiplier: 1 })) } },
    ];

    for (const value of cases) {
      storage.clear();
      storage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      expect(loadDrillMatch("scoringSprint")).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    }

    const legacyKey = "dartio:drill-log:v1:scoringSprint";
    storage.setItem(legacyKey, "{not-json");
    expect(loadDrillMatch("scoringSprint")).toBeNull();
    expect(storage.getItem(legacyKey)).toBeNull();
  });

  it("rejects rejected post-completion events and completed drill logs", () => {
    const completedEvents = Array.from({ length: 30 }, () => drillDartEvent(dart(20)));
    const completed = { ...createDrillLog("scoringSprint"), events: completedEvents };
    storage.setItem(drillResumeKey("scoringSprint"), JSON.stringify(envelope(completed)));
    expect(loadDrillMatch("scoringSprint")).toBeNull();
    expect(storage.getItem(drillResumeKey("scoringSprint"))).toBeNull();

    const postComplete = {
      ...completed,
      events: [...completedEvents, drillDartEvent(dart(20))],
    };
    storage.setItem(drillResumeKey("scoringSprint"), JSON.stringify(envelope(postComplete)));
    expect(loadDrillMatch("scoringSprint")).toBeNull();
    expect(storage.getItem(drillResumeKey("scoringSprint"))).toBeNull();
  });

  it("fails closed without deleting an unknown envelope version", () => {
    const value = { ...envelope(active("scoringSprint")), rulesVersion: 2 };
    storage.setItem(drillResumeKey("scoringSprint"), JSON.stringify(value));

    expect(loadDrillMatch("scoringSprint")).toBeNull();
    expect(storage.getItem(drillResumeKey("scoringSprint"))).not.toBeNull();
  });

  it("never throws or writes when save receives malformed runtime input", () => {
    const invalid = {
      drill: "scoringSprint",
      events: [{ kind: "dart", segment: 20, multiplier: 1, x: Number.NaN, y: 0 }],
    } as DrillLog;
    expect(() => saveDrillMatch(invalid)).not.toThrow();
    expect(storage.length).toBe(0);
  });

  it("treats a valid empty drill log as no active run", () => {
    saveDrillMatch(active("scoringSprint"));
    storage.setItem("dartio:drill-log:v1:scoringSprint", "superseded");

    saveDrillMatch(createDrillLog("scoringSprint"));

    expect(storage.getItem(drillResumeKey("scoringSprint"))).toBeNull();
    expect(storage.getItem("dartio:drill-log:v1:scoringSprint")).toBeNull();
  });

  it("makes a throwing localStorage getter null/no-op for load, save, and clear", () => {
    const deniedWindow = {};
    Object.defineProperty(deniedWindow, "localStorage", {
      get() { throw new DOMException("denied", "SecurityError"); },
    });
    vi.stubGlobal("window", deniedWindow);

    expect(loadDrillMatch("scoringSprint")).toBeNull();
    expect(() => saveDrillMatch(active("scoringSprint"))).not.toThrow();
    expect(() => clearDrillMatch("scoringSprint")).not.toThrow();
  });

  it("contains getItem, setItem, and removeItem exceptions", () => {
    const getItem = vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(loadDrillMatch("scoringSprint")).toBeNull();
    getItem.mockRestore();

    const setItem = vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => saveDrillMatch(active("scoringSprint"))).not.toThrow();
    setItem.mockRestore();

    storage.setItem(drillResumeKey("scoringSprint"), "current");
    const removeItem = vi.spyOn(storage, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => clearDrillMatch("scoringSprint")).not.toThrow();
    expect(storage.getItem(drillResumeKey("scoringSprint"))).toBe("current");
    removeItem.mockRestore();
  });

  it("clears only the requested drill's current and superseded entries", () => {
    storage.setItem(drillResumeKey("scoringSprint"), "current");
    storage.setItem("dartio:drill-log:v1:scoringSprint", "legacy");
    storage.setItem(drillResumeKey("checkoutLab"), "other");

    clearDrillMatch("scoringSprint");
    expect(storage.getItem(drillResumeKey("scoringSprint"))).toBeNull();
    expect(storage.getItem("dartio:drill-log:v1:scoringSprint")).toBeNull();
    expect(storage.getItem(drillResumeKey("checkoutLab"))).toBe("other");
  });
});
