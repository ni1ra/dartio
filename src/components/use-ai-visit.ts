"use client";

import { useEffect, useRef } from "react";

/**
 * Runs an opponent's visit after a pause, once, and never twice.
 *
 * This exists because X01 got it wrong first. Its AI committed from inside a
 * `setTimeout` created a visit earlier, so it folded over a stale log, read the
 * stale result to decide whose turn it was, concluded it was still its own, and
 * re-queued itself forever — scoring against whichever player the stale turn order
 * happened to name. The fix was to read the log from a ref at the moment of
 * committing rather than from a closure.
 *
 * `play` is therefore called with no arguments on purpose: it must go and look at
 * what has actually happened, not at what had happened when the timer was set. The
 * generation counter cancels a queued visit that a correction or an unmount has
 * made obsolete.
 */
export function useAiVisit(options: {
  /** True only when it is the opponent's turn in a game still being played. */
  readonly ready: boolean;
  readonly play: () => void;
  readonly delayMs?: number;
}): void {
  const { ready, delayMs = 450 } = options;
  const play = useRef(options.play);
  // Written in an effect rather than during render: React may render without
  // committing, and a ref updated on a discarded render is a lie about the latest
  // callback.
  useEffect(() => { play.current = options.play; });
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    if (!ready) return;
    const mine = generation.current;
    const timer = window.setTimeout(() => {
      if (mine !== generation.current) return;
      play.current();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [ready, delayMs]);

  useEffect(() => () => { generation.current += 1; }, []);
}
