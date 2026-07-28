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
const KEY = "dartio:x01-log:v1";

export function loadActiveMatch(): X01Log | null {
  if (typeof window === "undefined") return null;
  try {
    return deserializeX01Log(window.localStorage.getItem(KEY));
  } catch {
    // Private-mode and storage-quota failures are not the player's problem;
    // they just mean this match cannot be resumed.
    return null;
  }
}

export function saveActiveMatch(log: X01Log): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, serializeX01Log(log));
  } catch {
    // Ignored for the same reason: losing resume must never break scoring.
  }
}

export function clearActiveMatch(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
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
