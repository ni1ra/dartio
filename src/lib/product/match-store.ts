"use client";

import { deserializeX01Log, serializeX01Log, type X01Log } from "@/domain";

/**
 * On-device storage for the active match.
 *
 * A match used to live in one React state, so a refresh, an evicted background
 * tab, or a dropped connection lost the leg — with no warning beforehand. The
 * event log is small enough to write on every dart, and writing the log rather
 * than the derived state means a resumed match is exactly the match that was
 * interrupted, down to where each dart landed on the board.
 *
 * Local storage is deliberate: free play requires no account, so resume must
 * work for a player who has never signed in. Cloud history is a separate
 * concern layered on top, not a replacement.
 */
const KEY_PREFIX = "dartio:x01-log:v2:";
const LEGACY_KEY = "dartio:x01-log:v1";
const STORAGE_VERSION = 1;

export interface StoredActiveMatch {
  readonly log: X01Log;
  /** A chosen or first-committed fallback applies for the rest of this match. */
  readonly continuedAtEight: boolean;
  /** Distinct execution levels that actually completed an AI visit. */
  readonly aiLevelsUsed: readonly number[];
}

function storageKey(scope: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(scope)}`;
}

export function loadActiveMatch(scope: string): StoredActiveMatch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) {
      // The old global key can be migrated only when its roster proves it was a
      // local pair. An AI log carried no requested/effective level, so assigning
      // it to any scoped bot key would recreate the history lie this envelope fixes.
      if (scope !== "local") return null;
      const legacyLog = deserializeX01Log(window.localStorage.getItem(LEGACY_KEY));
      return legacyLog?.players[1]?.name === "Player 2"
        ? { log: legacyLog, continuedAtEight: false, aiLevelsUsed: [] }
        : null;
    }
    const stored = JSON.parse(raw) as unknown;
    if (
      typeof stored !== "object"
      || stored === null
      || Array.isArray(stored)
      || !("storageVersion" in stored)
      || stored.storageVersion !== STORAGE_VERSION
      || !("continuedAtEight" in stored)
      || typeof stored.continuedAtEight !== "boolean"
      || !("aiLevelsUsed" in stored)
      || !Array.isArray(stored.aiLevelsUsed)
      || stored.aiLevelsUsed.some((level) => !Number.isInteger(level) || level < 1 || level > 20)
      || !("log" in stored)
      || typeof stored.log !== "string"
    ) return null;
    const log = deserializeX01Log(stored.log);
    return log ? {
      log,
      continuedAtEight: stored.continuedAtEight,
      aiLevelsUsed: [...new Set(stored.aiLevelsUsed as number[])],
    } : null;
  } catch {
    // Private-mode and storage-quota failures are not the player's problem;
    // they just mean this match cannot be resumed.
    return null;
  }
}

export function saveActiveMatch(
  log: X01Log,
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
      log: serializeX01Log(log),
    }));
  } catch {
    // Ignored for the same reason: losing resume must never break scoring.
  }
}

export function clearActiveMatch(scope: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(scope));
    if (scope === "local") window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Ignored.
  }
}

/**
 * True when a stored log belongs to the match the player just set up.
 *
 * Resuming is only correct for the same rules and the same players; walking to
 * the oche with different settings must start a new match rather than silently
 * continue an old one.
 */
export function matchesSetup(stored: X01Log, log: X01Log): boolean {
  return JSON.stringify(stored.options) === JSON.stringify(log.options)
    && JSON.stringify(stored.players) === JSON.stringify(log.players);
}
