"use client";

import { z } from "zod";
import { BOARD_CLOCKWISE, type CricketLog } from "@/domain";

/**
 * On-device storage for the active Cricket match.
 *
 * Same contract as the X01 store and for the same reasons: the log is small
 * enough to write on every dart, and persisting what was thrown means a resumed
 * match is exactly the match that was interrupted. Separate key and schema
 * because the two modes have different options and must never rehydrate into
 * each other.
 */
const KEY_PREFIX = "dartio:cricket-log:v2:";
const LEGACY_KEY = "dartio:cricket-log:v1";
const VERSION = 1;
const STORAGE_VERSION = 1;

const boardNumbers = [0, 25, ...BOARD_CLOCKWISE] as const;
const logSchema = z.object({
  version: z.literal(VERSION),
  options: z.object({
    variant: z.enum(["standard", "cut-throat", "tactics"]),
    winByTwo: z.boolean(),
    roundLimit: z.number().int().min(1).max(99).nullable(),
  }).strict(),
  players: z.array(z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(64) }).strict()).min(2).max(8),
  events: z.array(z.object({
    kind: z.literal("dart"),
    segment: z.number().int().refine((value) => (boardNumbers as readonly number[]).includes(value), "Not a scoring bed"),
    multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
  }).strict()).max(5000),
}).strict();

const storedMatchSchema = z.object({
  storageVersion: z.literal(STORAGE_VERSION),
  continuedAtEight: z.boolean(),
  aiLevelsUsed: z.array(z.number().int().min(1).max(20)).max(20),
  log: logSchema,
}).strict();

export interface StoredCricketMatch {
  readonly log: CricketLog;
  readonly continuedAtEight: boolean;
  readonly aiLevelsUsed: readonly number[];
}

function storageKey(scope: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(scope)}`;
}

export function loadCricketMatch(scope: string): StoredCricketMatch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) {
      if (scope !== "local") return null;
      const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
      if (!legacyRaw) return null;
      const legacy = logSchema.safeParse(JSON.parse(legacyRaw));
      if (!legacy.success || legacy.data.players[1]?.name !== "Player 2") return null;
      const { options, players, events } = legacy.data;
      return {
        log: { options, players, events } as CricketLog,
        continuedAtEight: false,
        aiLevelsUsed: [],
      };
    }
    const parsed = storedMatchSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const { options, players, events } = parsed.data.log;
    return {
      log: { options, players, events } as CricketLog,
      continuedAtEight: parsed.data.continuedAtEight,
      aiLevelsUsed: [...new Set(parsed.data.aiLevelsUsed)],
    };
  } catch {
    return null;
  }
}

export function saveCricketMatch(
  log: CricketLog,
  scope: string,
  continuedAtEight: boolean,
  aiLevelsUsed: readonly number[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify({
      storageVersion: STORAGE_VERSION,
      continuedAtEight,
      aiLevelsUsed,
      log: { version: VERSION, ...log },
    }));
  } catch {
    // Losing resume must never break scoring.
  }
}

export function clearCricketMatch(scope: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(scope));
    if (scope === "local") window.localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignored */ }
}

export function matchesCricketSetup(stored: CricketLog, log: CricketLog): boolean {
  return JSON.stringify(stored.options) === JSON.stringify(log.options)
    && JSON.stringify(stored.players) === JSON.stringify(log.players);
}
