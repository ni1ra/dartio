"use client";

import { z } from "zod";
import {
  BOARD_CLOCKWISE,
  replayRound,
  type RoundLog,
  type RoundModeId,
} from "@/domain";

const KEY_PREFIX = "dartio:round-log:v3:";
const LEGACY_V2_PREFIX = "dartio:round-log:v2:";
const LEGACY_V1_PREFIX = "dartio:round-log:v1:";
const STORAGE_VERSION = 1;
const LOG_VERSION = 1;
const RULES_VERSION = 1;

const modeSchema = z.enum(["aroundTheClock", "shanghai", "countUp", "bobs27"]);
const playerSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
}).strict();
const boardNumbers = [0, 25, ...BOARD_CLOCKWISE] as const;
const eventSchema = z.object({
  kind: z.literal("dart"),
  segment: z.number().int().refine(
    (value) => (boardNumbers as readonly number[]).includes(value),
    "Not a scoring bed",
  ),
  multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
}).strict().superRefine((event, context) => {
  if ((event.x === undefined) !== (event.y === undefined)) {
    context.addIssue({ code: "custom", message: "A landing needs both coordinates" });
  }
  if ((event.segment === 0 && event.multiplier !== 1)
    || (event.segment === 25 && event.multiplier === 3)) {
    context.addIssue({ code: "custom", message: "Impossible bed and multiplier" });
  }
});

const logBodySchema = z.object({
  mode: modeSchema,
  players: z.array(playerSchema).min(1).max(2),
  // A bounded replay keeps one hostile browser entry from monopolising a load.
  events: z.array(eventSchema).min(1).max(5000),
}).strict();
const currentLogSchema = logBodySchema.extend({ version: z.literal(LOG_VERSION) }).strict();
const emptyLogSchema = logBodySchema.omit({ events: true }).extend({
  events: z.array(eventSchema).length(0),
}).strict();

const scopeSchema = z.discriminatedUnion("opponent", [
  z.object({ mode: modeSchema, opponent: z.literal("solo") }).strict(),
  z.object({ mode: modeSchema, opponent: z.literal("local") }).strict(),
  z.object({
    mode: modeSchema,
    opponent: z.literal("ai"),
    requestedLevel: z.number().int().min(1).max(20),
  }).strict(),
]);

const storedMatchSchema = z.object({
  storageVersion: z.literal(STORAGE_VERSION),
  rulesVersion: z.literal(RULES_VERSION),
  scope: scopeSchema,
  continuedAtEight: z.boolean(),
  aiLevelsUsed: z.array(z.number().int().min(1).max(20)).max(20),
  log: currentLogSchema,
}).strict();
const legacyV2Schema = z.object({
  storageVersion: z.literal(STORAGE_VERSION),
  continuedAtEight: z.boolean(),
  aiLevelsUsed: z.array(z.number().int().min(1).max(20)).max(20),
  log: logBodySchema,
}).strict();

export type RoundResumeScope =
  | { readonly mode: RoundModeId; readonly opponent: "solo" }
  | { readonly mode: RoundModeId; readonly opponent: "local" }
  | { readonly mode: RoundModeId; readonly opponent: "ai"; readonly requestedLevel: number };

export interface StoredRoundMatch {
  readonly log: RoundLog;
  readonly continuedAtEight: boolean;
  readonly aiLevelsUsed: readonly number[];
}

interface StoredMetadata {
  readonly continuedAtEight: boolean;
  readonly aiLevelsUsed: readonly number[];
}

type DecodeResult =
  | { readonly kind: "valid"; readonly value: StoredRoundMatch }
  | { readonly kind: "unknown-version" }
  | { readonly kind: "invalid" };

/** Some privacy modes throw while the `localStorage` property itself is read. */
function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function remove(storage: Storage, key: string): void {
  try { storage.removeItem(key); } catch { /* resume cleanup is best-effort */ }
}

/** The v3 key states every choice that can change who or what resumes. */
export function roundResumeKey(scope: RoundResumeScope): string {
  const opponent = scope.opponent === "ai"
    ? `ai:level-${scope.requestedLevel}`
    : scope.opponent;
  return `${KEY_PREFIX}${scope.mode}:${opponent}`;
}

function legacyV2Key(scope: RoundResumeScope): string {
  const slot = scope.opponent === "ai" ? `ai-${scope.requestedLevel}` : scope.opponent;
  return `${LEGACY_V2_PREFIX}${scope.mode}:${slot}`;
}

function legacyV1Key(scope: RoundResumeScope): string | null {
  if (scope.opponent === "ai") return null;
  return `${LEGACY_V1_PREFIX}${scope.mode}:${scope.opponent === "solo" ? "solo" : "pair"}`;
}

function legacyPairKey(scope: RoundResumeScope): string {
  return `${LEGACY_V1_PREFIX}${scope.mode}:pair`;
}

function sameScope(left: z.infer<typeof scopeSchema>, right: RoundResumeScope): boolean {
  return left.mode === right.mode
    && left.opponent === right.opponent
    && (left.opponent !== "ai"
      || (right.opponent === "ai" && left.requestedLevel === right.requestedLevel));
}

/**
 * The setup comparison is intentionally exact. A local pair, a solo practice
 * run, and The Navigator can share rules while still being different matches.
 */
export function matchesRoundSetup(stored: RoundLog, expected: RoundLog): boolean {
  return stored.mode === expected.mode
    && JSON.stringify(stored.players) === JSON.stringify(expected.players);
}

function scopeMatchesSetup(scope: RoundResumeScope, expected: RoundLog): boolean {
  if (expected.mode !== scope.mode || expected.events.length !== 0) return false;
  const players = expected.players;
  if (scope.opponent === "solo") {
    return JSON.stringify(players) === JSON.stringify([{ id: "you", name: "Player 1" }]);
  }
  return JSON.stringify(players) === JSON.stringify([
    { id: "you", name: "Player 1" },
    { id: "them", name: scope.opponent === "ai" ? "The Navigator" : "Player 2" },
  ]);
}

function metadataMatchesScope(
  scope: RoundResumeScope,
  metadata: StoredMetadata,
): boolean {
  if (new Set(metadata.aiLevelsUsed).size !== metadata.aiLevelsUsed.length) return false;
  if (scope.opponent !== "ai") {
    return !metadata.continuedAtEight && metadata.aiLevelsUsed.length === 0;
  }
  if (metadata.continuedAtEight && scope.requestedLevel <= 8) return false;
  if (scope.requestedLevel > 8
    && metadata.aiLevelsUsed.includes(8)
    && !metadata.continuedAtEight) return false;
  return metadata.aiLevelsUsed.every(
    (level) => level === scope.requestedLevel || (scope.requestedLevel > 8 && level === 8),
  );
}

function activeLog(
  body: z.infer<typeof logBodySchema>,
  scope: RoundResumeScope,
  expected: RoundLog,
): RoundLog | null {
  const log = { mode: body.mode, players: body.players, events: body.events } as RoundLog;
  if (body.mode !== scope.mode || !matchesRoundSetup(log, expected)) return null;
  const replayed = replayRound(log);
  return replayed.rejected.length === 0 && replayed.state.status === "playing" ? log : null;
}

function parsedObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function decodeCurrent(raw: string, scope: RoundResumeScope, expected: RoundLog): DecodeResult {
  const object = parsedObject(raw);
  if (!object) return { kind: "invalid" };
  if ((typeof object.storageVersion === "number" && object.storageVersion !== STORAGE_VERSION)
    || (typeof object.rulesVersion === "number" && object.rulesVersion !== RULES_VERSION)) {
    return { kind: "unknown-version" };
  }
  const rawLog = object.log;
  if (typeof rawLog === "object" && rawLog !== null && !Array.isArray(rawLog)) {
    const version = (rawLog as Record<string, unknown>).version;
    if (typeof version === "number" && version !== LOG_VERSION) return { kind: "unknown-version" };
  }
  const parsed = storedMatchSchema.safeParse(object);
  if (!parsed.success || !sameScope(parsed.data.scope, scope)) return { kind: "invalid" };
  const metadata = { continuedAtEight: parsed.data.continuedAtEight, aiLevelsUsed: parsed.data.aiLevelsUsed };
  if (!metadataMatchesScope(scope, metadata)) return { kind: "invalid" };
  const log = activeLog(parsed.data.log, scope, expected);
  return log
    ? { kind: "valid", value: { log, ...metadata } }
    : { kind: "invalid" };
}

function decodeLegacyV2(raw: string, scope: RoundResumeScope, expected: RoundLog): DecodeResult {
  const object = parsedObject(raw);
  if (!object) return { kind: "invalid" };
  if (typeof object.storageVersion === "number" && object.storageVersion !== STORAGE_VERSION) {
    return { kind: "unknown-version" };
  }
  const parsed = legacyV2Schema.safeParse(object);
  if (!parsed.success) return { kind: "invalid" };
  const metadata = { continuedAtEight: parsed.data.continuedAtEight, aiLevelsUsed: parsed.data.aiLevelsUsed };
  if (!metadataMatchesScope(scope, metadata)) return { kind: "invalid" };
  const log = activeLog(parsed.data.log, scope, expected);
  return log
    ? { kind: "valid", value: { log, ...metadata } }
    : { kind: "invalid" };
}

function decodeLegacyV1(raw: string, scope: RoundResumeScope, expected: RoundLog): DecodeResult {
  const object = parsedObject(raw);
  if (!object) return { kind: "invalid" };
  // Production v1 had no top-level version. A numeric one therefore belongs
  // to a newer writer and must survive regardless of which setup opens first.
  if (typeof object.version === "number") return { kind: "unknown-version" };
  const parsed = logBodySchema.safeParse(object);
  if (!parsed.success) return { kind: "invalid" };
  const log = activeLog(parsed.data, scope, expected);
  return log
    ? {
        kind: "valid",
        value: { log, continuedAtEight: false, aiLevelsUsed: [] },
      }
    : { kind: "invalid" };
}

function classifyLegacyPair(raw: string, mode: RoundModeId): "local" | "ambiguous" | "unknown-version" {
  const object = parsedObject(raw);
  if (!object) return "ambiguous";
  // v1 had no version field. A later writer that adds one belongs to that
  // writer, so this reader fails closed without destroying its recovery data.
  if (typeof object.version === "number") return "unknown-version";
  const parsed = logBodySchema.safeParse(object);
  if (!parsed.success || parsed.data.mode !== mode) return "ambiguous";
  const localRoster = JSON.stringify(parsed.data.players) === JSON.stringify([
    { id: "you", name: "Player 1" },
    { id: "them", name: "Player 2" },
  ]);
  return localRoster ? "local" : "ambiguous";
}

function envelope(value: StoredRoundMatch, scope: RoundResumeScope): unknown {
  return {
    storageVersion: STORAGE_VERSION,
    rulesVersion: RULES_VERSION,
    scope,
    continuedAtEight: value.continuedAtEight,
    aiLevelsUsed: value.aiLevelsUsed,
    log: { version: LOG_VERSION, ...value.log },
  };
}

function write(storage: Storage, key: string, value: StoredRoundMatch, scope: RoundResumeScope): boolean {
  try {
    storage.setItem(key, JSON.stringify(envelope(value, scope)));
    return true;
  } catch {
    return false;
  }
}

function migrate(
  storage: Storage,
  oldKey: string,
  value: StoredRoundMatch,
  scope: RoundResumeScope,
): StoredRoundMatch {
  // The old entry remains the recovery copy unless the new write has succeeded.
  if (write(storage, roundResumeKey(scope), value, scope)) {
    remove(storage, oldKey);
  }
  return value;
}

export function loadRoundMatch(scope: RoundResumeScope, expected: RoundLog): StoredRoundMatch | null {
  if (!scopeMatchesSetup(scope, expected)) return null;
  const storage = browserStorage();
  if (!storage) return null;
  try {
    const key = roundResumeKey(scope);
    const currentRaw = storage.getItem(key);
    if (currentRaw !== null) {
      const decoded = decodeCurrent(currentRaw, scope, expected);
      if (decoded.kind === "valid") return decoded.value;
      // Known-but-invalid and completed envelopes cannot become active again.
      if (decoded.kind === "invalid") remove(storage, key);
      return null;
    }

    const v2Key = legacyV2Key(scope);
    const v2Raw = storage.getItem(v2Key);
    if (v2Raw !== null) {
      const decoded = decodeLegacyV2(v2Raw, scope, expected);
      if (decoded.kind === "valid") return migrate(storage, v2Key, decoded.value, scope);
      if (decoded.kind === "invalid") remove(storage, v2Key);
      return null;
    }

    if (scope.opponent === "ai") {
      const pairKey = legacyPairKey(scope);
      const pairRaw = storage.getItem(pairKey);
      if (pairRaw !== null && classifyLegacyPair(pairRaw, scope.mode) === "ambiguous") {
        // The old pair slot carried no requested/effective AI level. It cannot
        // be resumed truthfully, but one recognized local pair must remain for
        // the local setup even when the player happened to open AI first.
        remove(storage, pairKey);
      }
      return null;
    }

    // Production's v1 pair key did not distinguish a local player from AI.
    // AI therefore starts fresh; solo and an exact local roster are unambiguous.
    const v1Key = legacyV1Key(scope);
    if (!v1Key) return null;
    const v1Raw = storage.getItem(v1Key);
    if (v1Raw === null) return null;
    const decoded = decodeLegacyV1(v1Raw, scope, expected);
    if (decoded.kind === "valid") return migrate(storage, v1Key, decoded.value, scope);
    if (decoded.kind === "invalid") remove(storage, v1Key);
    return null;
  } catch {
    return null;
  }
}

export function saveRoundMatch(
  log: RoundLog,
  scope: RoundResumeScope,
  continuedAtEight: boolean,
  aiLevelsUsed: readonly number[],
): void {
  const metadata = {
    continuedAtEight,
    aiLevelsUsed: [...new Set(aiLevelsUsed)],
  };
  const setup = { ...log, events: [] };
  if (log.events.length === 0) {
    // Empty means an explicit nonempty→empty scoring transition (for example,
    // undoing the first dart), never a hydration miss. Callers must keep that
    // distinction so a future-version envelope preserved by load stays intact.
    const empty = emptyLogSchema.safeParse(log);
    if (empty.success
      && scopeSchema.safeParse(scope).success
      && scopeMatchesSetup(scope, log)) clearRoundMatch(scope);
    return;
  }
  const parsed = logBodySchema.safeParse(log);
  if (!scopeMatchesSetup(scope, setup)
    || !metadataMatchesScope(scope, metadata)
    || !parsed.success
    || !activeLog(parsed.data, scope, setup)) return;
  const storage = browserStorage();
  if (!storage) return;
  write(storage, roundResumeKey(scope), { log, ...metadata }, scope);
}

export function clearRoundMatch(scope: RoundResumeScope): void {
  const storage = browserStorage();
  if (!storage) return;
  remove(storage, roundResumeKey(scope));
  remove(storage, legacyV2Key(scope));
  const v1Key = legacyV1Key(scope);
  if (v1Key) remove(storage, v1Key);
}
