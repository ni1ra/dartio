"use client";

import { z } from "zod";
import {
  BOARD_CLOCKWISE,
  replayDrill,
  type DrillId,
  type DrillLog,
} from "@/domain";

const KEY_PREFIX = "dartio:drill-log:v2:";
const LEGACY_PREFIX = "dartio:drill-log:v1:";
const STORAGE_VERSION = 1;
const LOG_VERSION = 1;
const RULES_VERSION = 1;

const drillSchema = z.enum(["checkoutLab", "doublesMatrix", "scoringSprint"]);
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
  drill: drillSchema,
  // A corrupted entry cannot turn a page load into an unbounded replay.
  events: z.array(eventSchema).min(1).max(5000),
}).strict();
const currentLogSchema = logBodySchema.extend({ version: z.literal(LOG_VERSION) }).strict();
const emptyLogSchema = logBodySchema.omit({ events: true }).extend({
  events: z.array(eventSchema).length(0),
}).strict();
const storedDrillSchema = z.object({
  storageVersion: z.literal(STORAGE_VERSION),
  rulesVersion: z.literal(RULES_VERSION),
  scope: z.object({ drill: drillSchema }).strict(),
  log: currentLogSchema,
}).strict();

type DecodeResult =
  | { readonly kind: "valid"; readonly log: DrillLog }
  | { readonly kind: "unknown-version" }
  | { readonly kind: "invalid" };

/** Browsers may deny storage by throwing before an operation can even run. */
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

export function drillResumeKey(drill: DrillId): string {
  return `${KEY_PREFIX}${drill}`;
}

function legacyKey(drill: DrillId): string {
  return `${LEGACY_PREFIX}${drill}`;
}

function activeLog(body: z.infer<typeof logBodySchema>, drill: DrillId): DrillLog | null {
  if (body.drill !== drill) return null;
  const log = { drill: body.drill, events: body.events } as DrillLog;
  const replayed = replayDrill(log);
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

function decodeCurrent(raw: string, drill: DrillId): DecodeResult {
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
  const parsed = storedDrillSchema.safeParse(object);
  if (!parsed.success || parsed.data.scope.drill !== drill) return { kind: "invalid" };
  const log = activeLog(parsed.data.log, drill);
  return log ? { kind: "valid", log } : { kind: "invalid" };
}

function decodeLegacy(raw: string, drill: DrillId): DecodeResult {
  const object = parsedObject(raw);
  if (!object) return { kind: "invalid" };
  // Production v1 was an unversioned raw log. A numeric top-level version
  // belongs to a future writer and must remain available to that writer.
  if (typeof object.version === "number") return { kind: "unknown-version" };
  const parsed = logBodySchema.safeParse(object);
  if (!parsed.success) return { kind: "invalid" };
  const log = activeLog(parsed.data, drill);
  return log ? { kind: "valid", log } : { kind: "invalid" };
}

function envelope(log: DrillLog): unknown {
  return {
    storageVersion: STORAGE_VERSION,
    rulesVersion: RULES_VERSION,
    scope: { drill: log.drill },
    log: { version: LOG_VERSION, ...log },
  };
}

function write(storage: Storage, log: DrillLog): boolean {
  try {
    storage.setItem(drillResumeKey(log.drill), JSON.stringify(envelope(log)));
    return true;
  } catch {
    return false;
  }
}

export function loadDrillMatch(drill: DrillId): DrillLog | null {
  const storage = browserStorage();
  if (!storage) return null;
  try {
    const key = drillResumeKey(drill);
    const currentRaw = storage.getItem(key);
    if (currentRaw !== null) {
      const decoded = decodeCurrent(currentRaw, drill);
      if (decoded.kind === "valid") return decoded.log;
      if (decoded.kind === "invalid") remove(storage, key);
      return null;
    }

    const oldKey = legacyKey(drill);
    const legacyRaw = storage.getItem(oldKey);
    if (legacyRaw === null) return null;
    const decoded = decodeLegacy(legacyRaw, drill);
    if (decoded.kind === "invalid") remove(storage, oldKey);
    if (decoded.kind !== "valid") return null;
    // A quota failure leaves the only valid resume copy exactly where it was.
    if (write(storage, decoded.log)) {
      remove(storage, oldKey);
    }
    return decoded.log;
  } catch {
    return null;
  }
}

export function saveDrillMatch(log: DrillLog): void {
  if (log.events.length === 0) {
    // Only a caller-observed nonempty→empty transition is a clear. Initial
    // hydration may be empty because a newer envelope was deliberately refused.
    if (emptyLogSchema.safeParse(log).success) clearDrillMatch(log.drill);
    return;
  }
  const parsed = logBodySchema.safeParse(log);
  if (!parsed.success || !activeLog(parsed.data, log.drill)) return;
  const storage = browserStorage();
  if (!storage) return;
  write(storage, log);
}

export function clearDrillMatch(drill: DrillId): void {
  const storage = browserStorage();
  if (!storage) return;
  remove(storage, drillResumeKey(drill));
  remove(storage, legacyKey(drill));
}
