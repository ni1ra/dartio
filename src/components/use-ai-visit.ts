"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AiVisitController {
  /** Re-runs the current authoritative visit after the caller clears its error. */
  readonly retry: () => void;
  /** Invalidates a timer or request before correction, undo, or navigation. */
  readonly cancel: () => void;
}

/**
 * Schedules one cancellable opponent visit for one authoritative log revision.
 *
 * `generate` receives no captured match state: callers replay their current log
 * when the timer actually fires. A generation token and AbortController guard
 * both the delayed start and every asynchronous completion, so a correction or
 * unmount cannot append a stale visit after it has already left the screen.
 */
export function useAiVisit<Value>(options: {
  readonly ready: boolean;
  readonly revision: string | number;
  readonly generate: (signal: AbortSignal) => Promise<Value> | Value;
  readonly commit: (value: Value) => void;
  readonly fail: (problem: unknown) => void;
  readonly delayMs?: number;
}): AiVisitController {
  const { ready, revision, delayMs = 450 } = options;
  const generate = useRef(options.generate);
  const commit = useRef(options.commit);
  const fail = useRef(options.fail);
  const generation = useRef(0);
  const timer = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Refs move only after React commits the render. A discarded render must never
  // become the source of a visit that later writes to the authoritative log.
  useEffect(() => {
    generate.current = options.generate;
    commit.current = options.commit;
    fail.current = options.fail;
  });

  const cancel = useCallback(() => {
    generation.current += 1;
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    controller.current?.abort();
    controller.current = null;
  }, []);

  const retry = useCallback(() => {
    setRetryNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    cancel();
    if (!ready) return;

    const mine = generation.current;
    const request = new AbortController();
    controller.current = request;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      let pending: Promise<Value>;
      try {
        pending = Promise.resolve(generate.current(request.signal));
      } catch (problem) {
        pending = Promise.reject(problem);
      }
      void pending.then(
        (value) => {
          if (
            request.signal.aborted
            || mine !== generation.current
            || controller.current !== request
          ) return;
          controller.current = null;
          commit.current(value);
        },
        (problem: unknown) => {
          if (
            request.signal.aborted
            || mine !== generation.current
            || controller.current !== request
          ) return;
          controller.current = null;
          fail.current(problem);
        },
      );
    }, delayMs);

    return cancel;
  }, [ready, revision, retryNonce, delayMs, cancel]);

  return { retry, cancel };
}
