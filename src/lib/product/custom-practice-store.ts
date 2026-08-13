"use client";

import { z } from "zod";
import {
  BOARD_CLOCKWISE,
  CUSTOM_PRACTICE_MAX_TARGETS,
  encodeCustomPracticePath,
  replayCustomPractice,
  type CustomPracticeLog,
  type PracticeTarget,
} from "@/domain";

const KEY_PREFIX = "dartio:custom-practice-log:v1:";
const STORAGE_VERSION = 1;
const RULES_VERSION = 1;
const LOG_VERSION = 1;
const boardNumbers = [25, ...BOARD_CLOCKWISE] as const;
const eventBoardNumbers = [0, ...boardNumbers] as const;

const targetSchema = z.object({
  segment: z.number().int().refine((value) => (boardNumbers as readonly number[]).includes(value)),
  multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
}).strict().refine(
  (target) => target.segment !== 25 || target.multiplier !== 3,
  "The bull has no treble bed",
);

const eventSchema = z.object({
  kind: z.literal("dart"),
  segment: z.number().int().refine((value) => (eventBoardNumbers as readonly number[]).includes(value)),
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
  targets: z.array(targetSchema).min(1).max(CUSTOM_PRACTICE_MAX_TARGETS),
  events: z.array(eventSchema).min(1).max(CUSTOM_PRACTICE_MAX_TARGETS * 3),
}).strict();
const emptyLogSchema = logBodySchema.omit({ events: true }).extend({ events: z.array(eventSchema).length(0) }).strict();
const currentLogSchema = logBodySchema.extend({ version: z.literal(LOG_VERSION) }).strict();
const storedSchema = z.object({
  storageVersion: z.literal(STORAGE_VERSION),
  rulesVersion: z.literal(RULES_VERSION),
  scope: z.object({ path: z.string().min(1).max(96) }).strict(),
  log: currentLogSchema,
}).strict();

type DecodeResult =
  | { readonly kind: "valid"; readonly log: CustomPracticeLog }
  | { readonly kind: "unknown-version" }
  | { readonly kind: "invalid" };

/** Storage denial is an optional-capability failure, never a scoring failure. */
function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function remove(storage: Storage, key: string): void {
  try { storage.removeItem(key); } catch { /* best-effort resume cleanup */ }
}

export function customPracticeResumeKey(targets: readonly PracticeTarget[]): string {
  return `${KEY_PREFIX}${encodeCustomPracticePath(targets)}`;
}

function activeLog(value: z.infer<typeof logBodySchema>, expected: readonly PracticeTarget[]): CustomPracticeLog | null {
  // Zod has already proved every numeric segment is one of the BoardNumber
  // literals; this restores that narrower domain type after parsing.
  const targets = value.targets as unknown as readonly PracticeTarget[];
  if (encodeCustomPracticePath(targets) !== encodeCustomPracticePath(expected)) return null;
  const log = { targets, events: value.events } as CustomPracticeLog;
  const replayed = replayCustomPractice(log);
  return replayed.rejected.length === 0 && replayed.state.status === "playing" ? log : null;
}

function decode(raw: string, expected: readonly PracticeTarget[]): DecodeResult {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { kind: "invalid" }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { kind: "invalid" };
  const object = value as Record<string, unknown>;
  if ((typeof object.storageVersion === "number" && object.storageVersion !== STORAGE_VERSION)
    || (typeof object.rulesVersion === "number" && object.rulesVersion !== RULES_VERSION)) {
    return { kind: "unknown-version" };
  }
  const rawLog = object.log;
  if (rawLog && typeof rawLog === "object" && !Array.isArray(rawLog)) {
    const version = (rawLog as Record<string, unknown>).version;
    if (typeof version === "number" && version !== LOG_VERSION) return { kind: "unknown-version" };
  }
  const parsed = storedSchema.safeParse(value);
  const path = encodeCustomPracticePath(expected);
  if (!parsed.success || parsed.data.scope.path !== path) return { kind: "invalid" };
  const log = activeLog(parsed.data.log, expected);
  return log ? { kind: "valid", log } : { kind: "invalid" };
}

function envelope(log: CustomPracticeLog): unknown {
  const path = encodeCustomPracticePath(log.targets);
  return {
    storageVersion: STORAGE_VERSION,
    rulesVersion: RULES_VERSION,
    scope: { path },
    log: { version: LOG_VERSION, ...log },
  };
}

export function loadCustomPractice(targets: readonly PracticeTarget[]): CustomPracticeLog | null {
  const storage = browserStorage();
  if (!storage) return null;
  const key = customPracticeResumeKey(targets);
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const decoded = decode(raw, targets);
    if (decoded.kind === "invalid") remove(storage, key);
    return decoded.kind === "valid" ? decoded.log : null;
  } catch {
    return null;
  }
}

export function saveCustomPractice(log: CustomPracticeLog): void {
  if (log.events.length === 0) {
    if (emptyLogSchema.safeParse(log).success) clearCustomPractice(log.targets);
    return;
  }
  const parsed = logBodySchema.safeParse(log);
  if (!parsed.success || !activeLog(parsed.data, log.targets)) return;
  const storage = browserStorage();
  if (!storage) return;
  try { storage.setItem(customPracticeResumeKey(log.targets), JSON.stringify(envelope(log))); } catch { /* optional */ }
}

export function clearCustomPractice(targets: readonly PracticeTarget[]): void {
  const storage = browserStorage();
  if (!storage) return;
  remove(storage, customPracticeResumeKey(targets));
}
