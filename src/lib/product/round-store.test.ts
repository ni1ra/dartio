import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendRoundEvent,
  createRoundLog,
  dart,
  roundDartEvent,
  type RoundLog,
} from "@/domain";
import {
  clearRoundMatch,
  loadRoundMatch,
  roundResumeKey,
  saveRoundMatch,
  type RoundResumeScope,
} from "./round-store";

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
const soloScope: RoundResumeScope = { mode: "countUp", opponent: "solo" };
const localScope: RoundResumeScope = { mode: "countUp", opponent: "local" };
const aiScope: RoundResumeScope = { mode: "countUp", opponent: "ai", requestedLevel: 20 };

const SOLO = [{ id: "you", name: "Player 1" }] as const;
const LOCAL = [{ id: "you", name: "Player 1" }, { id: "them", name: "Player 2" }] as const;
const AI = [{ id: "you", name: "Player 1" }, { id: "them", name: "The Navigator" }] as const;

function fresh(scope: RoundResumeScope): RoundLog {
  return createRoundLog(scope.mode, scope.opponent === "solo" ? SOLO : scope.opponent === "local" ? LOCAL : AI);
}

function active(scope: RoundResumeScope): RoundLog {
  return appendRoundEvent(fresh(scope), roundDartEvent(dart(20, 3, { x: 0.1, y: -0.2 })));
}

function currentEnvelope(scope: RoundResumeScope, log: RoundLog = active(scope)): Record<string, unknown> {
  return {
    storageVersion: 1,
    rulesVersion: 1,
    scope,
    continuedAtEight: false,
    aiLevelsUsed: scope.opponent === "ai" ? [scope.requestedLevel] : [],
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

describe("round-mode resume storage", () => {
  it.each(["aroundTheClock", "shanghai", "countUp", "bobs27"] as const)(
    "round-trips a valid active %s log",
    (mode) => {
      const scope: RoundResumeScope = { mode, opponent: "solo" };
      const log = active(scope);
      saveRoundMatch(log, scope, false, []);
      expect(loadRoundMatch(scope, fresh(scope))?.log).toEqual(log);
    },
  );

  it("round-trips one exact solo setup through a strict versioned envelope", () => {
    const log = active(soloScope);
    saveRoundMatch(log, soloScope, false, []);

    expect(loadRoundMatch(soloScope, fresh(soloScope))).toEqual({
      log,
      continuedAtEight: false,
      aiLevelsUsed: [],
    });
    expect(JSON.parse(storage.getItem(roundResumeKey(soloScope))!)).toMatchObject({
      storageVersion: 1,
      rulesVersion: 1,
      scope: soloScope,
      log: { version: 1, mode: "countUp" },
    });
  });

  it("binds opponent and requested AI level into the key, envelope, metadata, and roster", () => {
    const continued = { ...currentEnvelope(aiScope), continuedAtEight: true, aiLevelsUsed: [20, 8] };
    storage.setItem(roundResumeKey(aiScope), JSON.stringify(continued));

    expect(loadRoundMatch(aiScope, fresh(aiScope))).toMatchObject({
      continuedAtEight: true,
      aiLevelsUsed: [20, 8],
    });
    expect(loadRoundMatch({ ...aiScope, requestedLevel: 19 }, fresh({ ...aiScope, requestedLevel: 19 }))).toBeNull();
    expect(loadRoundMatch(aiScope, fresh(localScope))).toBeNull();
    expect(roundResumeKey(aiScope)).not.toBe(roundResumeKey(localScope));
  });

  it("migrates a valid v2 AI envelope without losing its continuation evidence", () => {
    const oldKey = "dartio:round-log:v2:countUp:ai-20";
    storage.setItem(oldKey, JSON.stringify({
      storageVersion: 1,
      continuedAtEight: true,
      aiLevelsUsed: [20, 8],
      log: active(aiScope),
    }));

    expect(loadRoundMatch(aiScope, fresh(aiScope))).toMatchObject({
      continuedAtEight: true,
      aiLevelsUsed: [20, 8],
    });
    expect(storage.getItem(oldKey)).toBeNull();
    expect(storage.getItem(roundResumeKey(aiScope))).not.toBeNull();
  });

  it("migrates only the unambiguous v1 solo/local shapes", () => {
    const oldLocalKey = "dartio:round-log:v1:countUp:pair";
    storage.setItem(oldLocalKey, JSON.stringify(active(localScope)));

    expect(loadRoundMatch(localScope, fresh(localScope))?.log.players[1]?.name).toBe("Player 2");
    expect(storage.getItem(oldLocalKey)).toBeNull();

    storage.clear();
    storage.setItem(oldLocalKey, JSON.stringify(active(aiScope)));
    expect(loadRoundMatch(aiScope, fresh(aiScope))).toBeNull();
    expect(storage.getItem(oldLocalKey)).toBeNull();
  });

  it("keeps a roster-proven v1 local pair when the AI setup opens first", () => {
    const oldKey = "dartio:round-log:v1:countUp:pair";
    storage.setItem(oldKey, JSON.stringify(active(localScope)));

    expect(loadRoundMatch(aiScope, fresh(aiScope))).toBeNull();
    expect(storage.getItem(oldKey)).not.toBeNull();
    expect(loadRoundMatch(localScope, fresh(localScope))).not.toBeNull();
  });

  it("fails closed without deleting an unknown future pair format", () => {
    const oldKey = "dartio:round-log:v1:countUp:pair";
    storage.setItem(oldKey, JSON.stringify({ version: 2, ...active(aiScope) }));

    expect(loadRoundMatch(aiScope, fresh(aiScope))).toBeNull();
    expect(storage.getItem(oldKey)).not.toBeNull();
  });

  it("preserves a future v1 pair byte-for-byte when local opens first", () => {
    const oldKey = "dartio:round-log:v1:countUp:pair";
    const raw = `${JSON.stringify({ version: 2, ...active(localScope) })}\n`;
    storage.setItem(oldKey, raw);

    expect(loadRoundMatch(localScope, fresh(localScope))).toBeNull();
    expect(storage.getItem(oldKey)).toBe(raw);
    expect(storage.getItem(roundResumeKey(localScope))).toBeNull();
  });

  it("preserves a future v1 solo format byte-for-byte", () => {
    const oldKey = "dartio:round-log:v1:countUp:solo";
    const raw = ` ${JSON.stringify({ version: 7, ...active(soloScope) })}`;
    storage.setItem(oldKey, raw);

    expect(loadRoundMatch(soloScope, fresh(soloScope))).toBeNull();
    expect(storage.getItem(oldKey)).toBe(raw);
    expect(storage.getItem(roundResumeKey(soloScope))).toBeNull();
  });

  it("cleans a known invalid legacy local envelope instead of retrying it forever", () => {
    const oldKey = "dartio:round-log:v1:countUp:solo";
    storage.setItem(oldKey, JSON.stringify({ ...active(soloScope), events: [] }));

    expect(loadRoundMatch(soloScope, fresh(soloScope))).toBeNull();
    expect(storage.getItem(oldKey)).toBeNull();
  });

  it("keeps the legacy copy when the new migration write fails", () => {
    const oldKey = "dartio:round-log:v1:countUp:solo";
    storage.setItem(oldKey, JSON.stringify(active(soloScope)));
    const setItem = vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key === roundResumeKey(soloScope)) throw new DOMException("quota", "QuotaExceededError");
      MemoryStorage.prototype.setItem.call(storage, key, value);
    });

    expect(loadRoundMatch(soloScope, fresh(soloScope))).not.toBeNull();
    expect(setItem).toHaveBeenCalled();
    expect(storage.getItem(oldKey)).not.toBeNull();
  });

  it("rejects malformed, cross-mode, impossible, partial-coordinate, extra-key, and stale-rule data", () => {
    const cases: readonly Record<string, unknown>[] = [
      { ...currentEnvelope(soloScope), extra: true },
      { ...currentEnvelope(soloScope), scope: { mode: "shanghai", opponent: "solo" } },
      { ...currentEnvelope(soloScope), rulesVersion: 2 },
      { ...currentEnvelope(soloScope), log: { version: 1, ...active(soloScope), mode: "shanghai" } },
      { ...currentEnvelope(soloScope), log: { version: 1, ...active(soloScope), events: [{ kind: "dart", segment: 0, multiplier: 2 }] } },
      { ...currentEnvelope(soloScope), log: { version: 1, ...active(soloScope), events: [{ kind: "dart", segment: 25, multiplier: 3 }] } },
      { ...currentEnvelope(soloScope), log: { version: 1, ...active(soloScope), events: [{ kind: "dart", segment: 20, multiplier: 1, x: 0.1 }] } },
      { ...currentEnvelope(soloScope), log: { version: 1, ...active(soloScope), events: [{ kind: "dart", segment: 20, multiplier: 1, extra: true }] } },
    ];

    for (const value of cases) {
      storage.clear();
      storage.setItem(roundResumeKey(soloScope), JSON.stringify(value));
      expect(loadRoundMatch(soloScope, fresh(soloScope))).toBeNull();
    }
  });

  it("cleans malformed JSON, empty or oversized logs, and invalid rosters", () => {
    const key = roundResumeKey(soloScope);
    const base = currentEnvelope(soloScope);
    const cases: readonly (string | Record<string, unknown>)[] = [
      "{not-json",
      { ...base, log: { version: 1, ...active(soloScope), events: [] } },
      { ...base, log: { version: 1, ...active(soloScope), events: Array.from({ length: 5001 }, () => ({ kind: "dart", segment: 0, multiplier: 1 })) } },
      { ...base, log: { version: 1, ...active(soloScope), players: [{ id: "", name: "Player 1" }] } },
      { ...base, log: { version: 1, ...active(soloScope), players: [{ id: "you", name: "x".repeat(65) }] } },
    ];

    for (const value of cases) {
      storage.clear();
      storage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      expect(loadRoundMatch(soloScope, fresh(soloScope))).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    }

    const legacyKey = "dartio:round-log:v1:countUp:solo";
    storage.setItem(legacyKey, "{not-json");
    expect(loadRoundMatch(soloScope, fresh(soloScope))).toBeNull();
    expect(storage.getItem(legacyKey)).toBeNull();
  });

  it("rejects rejected replay events and completed logs, cleaning known invalid data", () => {
    const rejected = currentEnvelope(soloScope, {
      ...fresh(soloScope),
      events: Array.from({ length: 25 }, () => roundDartEvent(dart(20, 3))),
    });
    storage.setItem(roundResumeKey(soloScope), JSON.stringify(rejected));
    expect(loadRoundMatch(soloScope, fresh(soloScope))).toBeNull();
    expect(storage.getItem(roundResumeKey(soloScope))).toBeNull();

    const shanghaiScope: RoundResumeScope = { mode: "shanghai", opponent: "solo" };
    const completed = {
      ...fresh(shanghaiScope),
      events: [roundDartEvent(dart(1)), roundDartEvent(dart(1, 2)), roundDartEvent(dart(1, 3))],
    };
    storage.setItem(roundResumeKey(shanghaiScope), JSON.stringify(currentEnvelope(shanghaiScope, completed)));
    expect(loadRoundMatch(shanghaiScope, fresh(shanghaiScope))).toBeNull();
    expect(storage.getItem(roundResumeKey(shanghaiScope))).toBeNull();
  });

  it("fails closed but preserves unknown versions for a future compatible reader", () => {
    const value = { ...currentEnvelope(soloScope), storageVersion: 2 };
    storage.setItem(roundResumeKey(soloScope), JSON.stringify(value));

    expect(loadRoundMatch(soloScope, fresh(soloScope))).toBeNull();
    expect(storage.getItem(roundResumeKey(soloScope))).not.toBeNull();
  });

  it("rejects duplicate, out-of-range, and cross-level AI execution metadata", () => {
    const cases = [[20, 20], [21], [19], [8], [20, 8]];
    for (const aiLevelsUsed of cases) {
      storage.clear();
      storage.setItem(roundResumeKey(aiScope), JSON.stringify({
        ...currentEnvelope(aiScope),
        aiLevelsUsed,
      }));
      expect(loadRoundMatch(aiScope, fresh(aiScope))).toBeNull();
    }
  });

  it("never throws or writes when save receives an invalid runtime value", () => {
    const malformed = {
      ...active(soloScope),
      events: [{ kind: "dart", segment: 99, multiplier: 1 }],
    } as unknown as RoundLog;
    expect(() => saveRoundMatch(malformed, soloScope, false, [])).not.toThrow();
    expect(storage.length).toBe(0);
  });

  it("treats a valid empty log as no active match", () => {
    saveRoundMatch(active(soloScope), soloScope, false, []);
    storage.setItem("dartio:round-log:v2:countUp:solo", "superseded");

    saveRoundMatch(fresh(soloScope), soloScope, false, []);

    expect(storage.getItem(roundResumeKey(soloScope))).toBeNull();
    expect(storage.getItem("dartio:round-log:v2:countUp:solo")).toBeNull();
  });

  it("makes a throwing localStorage getter null/no-op for load, save, and clear", () => {
    const deniedWindow = {};
    Object.defineProperty(deniedWindow, "localStorage", {
      get() { throw new DOMException("denied", "SecurityError"); },
    });
    vi.stubGlobal("window", deniedWindow);

    expect(loadRoundMatch(soloScope, fresh(soloScope))).toBeNull();
    expect(() => saveRoundMatch(active(soloScope), soloScope, false, [])).not.toThrow();
    expect(() => clearRoundMatch(soloScope)).not.toThrow();
  });

  it("contains getItem, setItem, and removeItem exceptions", () => {
    const getItem = vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(loadRoundMatch(soloScope, fresh(soloScope))).toBeNull();
    getItem.mockRestore();

    const setItem = vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => saveRoundMatch(active(soloScope), soloScope, false, [])).not.toThrow();
    setItem.mockRestore();

    storage.setItem(roundResumeKey(soloScope), "current");
    const removeItem = vi.spyOn(storage, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => clearRoundMatch(soloScope)).not.toThrow();
    expect(storage.getItem(roundResumeKey(soloScope))).toBe("current");
    removeItem.mockRestore();
  });

  it("clears current and superseded keys only for the requested scope", () => {
    storage.setItem(roundResumeKey(soloScope), "current");
    storage.setItem("dartio:round-log:v2:countUp:solo", "v2");
    storage.setItem("dartio:round-log:v1:countUp:solo", "v1");
    storage.setItem(roundResumeKey(localScope), "other");

    clearRoundMatch(soloScope);
    expect(storage.getItem(roundResumeKey(soloScope))).toBeNull();
    expect(storage.getItem("dartio:round-log:v2:countUp:solo")).toBeNull();
    expect(storage.getItem("dartio:round-log:v1:countUp:solo")).toBeNull();
    expect(storage.getItem(roundResumeKey(localScope))).toBe("other");
  });
});
