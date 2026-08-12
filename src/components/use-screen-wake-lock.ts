"use client";

import { useEffect, useRef } from "react";

interface ScreenWakeLockSentinel extends EventTarget {
  readonly released: boolean;
  release(): Promise<void>;
}

interface ScreenWakeLockProvider {
  request(type: "screen"): Promise<ScreenWakeLockSentinel>;
}

/**
 * Keeps an active oche screen awake when the browser offers the Wake Lock API.
 *
 * This is deliberately progressive enhancement: scoring cannot depend on a
 * device permission, and a denied or unsupported request must remain invisible
 * rather than promising protection the browser did not grant. Hidden documents
 * release their lock; coming back to the tab requests a fresh sentinel because
 * browsers may discard the original while the page is in the background.
 */
export function useScreenWakeLock(active: boolean): void {
  const sentinelRef = useRef<ScreenWakeLockSentinel | null>(null);

  useEffect(() => {
    let disposed = false;
    let requestInFlight = false;
    let retryAfterFlight = false;
    let generation = 0;

    const release = () => {
      generation += 1;
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
    };

    const acquire = async () => {
      if (!active || disposed || sentinelRef.current || document.visibilityState !== "visible") return;
      // A visibility event can race a promise from the previous visible period.
      // Remember exactly that event; an ordinary permission denial must not loop.
      if (requestInFlight) {
        retryAfterFlight = true;
        return;
      }
      const wakeLock = (navigator as Navigator & { wakeLock?: ScreenWakeLockProvider }).wakeLock;
      if (!wakeLock) return;

      requestInFlight = true;
      const requestGeneration = generation;
      try {
        const sentinel = await wakeLock.request("screen");
        if (disposed || requestGeneration !== generation || !active || document.visibilityState !== "visible" || sentinelRef.current) {
          if (!sentinel.released) await sentinel.release().catch(() => undefined);
          return;
        }

        sentinelRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        }, { once: true });
      } catch {
        // Permission, power policy, and browser support are outside scoring. A
        // rejected enhancement must never interrupt the match.
      } finally {
        requestInFlight = false;
        const shouldRetry = retryAfterFlight;
        retryAfterFlight = false;
        if (shouldRetry && !disposed && active && document.visibilityState === "visible") {
          void acquire();
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
      else release();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void acquire();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      release();
    };
  }, [active]);
}
