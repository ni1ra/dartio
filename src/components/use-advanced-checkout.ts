"use client";

import { useEffect, useState } from "react";
import type { CheckoutAdvice, CheckoutPreferences, OutRule } from "@/domain";
import { requestAdvancedCheckoutAdvice } from "@/lib/product/checkout-advice-client";

export interface AdvancedCheckoutPosition {
  readonly score: number;
  readonly dartsAvailable: 1 | 2 | 3;
  readonly outRule: OutRule;
}

export interface AdvancedCheckoutState {
  /** Server-authorized advice for the current position, or null when unavailable. */
  readonly advice: CheckoutAdvice | null;
  /** True while this position's request is in flight. */
  readonly pending: boolean;
}

function positionKey(position: AdvancedCheckoutPosition, preferences: CheckoutPreferences): string {
  return [
    position.score, position.dartsAvailable, position.outRule,
    (preferences.preferredDoubles ?? []).join(","),
    (preferences.preferredTrebles ?? []).join(","),
    preferences.avoidBull ? "no-bull" : "",
  ].join("|");
}

/**
 * Fetches advanced checkout routes for the live position.
 *
 * The free route is always computed locally and rendered immediately, so this
 * never blocks scoring: a slow, failed, or unauthorized request simply leaves
 * the basic route on screen. Results are stored against the position key they
 * were requested for, so a stale response can never overwrite current advice —
 * and a settled failure is recorded as `advice: null` so the caller stops
 * reporting the position as pending.
 */
export function useAdvancedCheckout(
  position: AdvancedCheckoutPosition | null,
  enabled: boolean,
  preferences: CheckoutPreferences = {},
): AdvancedCheckoutState {
  const [settled, setSettled] = useState<{ key: string; advice: CheckoutAdvice | null } | null>(null);
  const key = position ? positionKey(position, preferences) : null;
  const active = enabled && position !== null && key !== null;

  useEffect(() => {
    if (!active || !position || !key) return;
    const request = new AbortController();
    void requestAdvancedCheckoutAdvice(
      { score: position.score, dartsAvailable: position.dartsAvailable, outRule: position.outRule, preferences },
      { signal: request.signal },
    )
      .then((advice) => { if (!request.signal.aborted) setSettled({ key, advice }); })
      // A denial or outage is not an error the player needs to see: the basic
      // route is already on screen and remains correct. Recording the miss
      // against the key stops it looking like a request still in flight.
      .catch(() => { if (!request.signal.aborted) setSettled({ key, advice: null }); });
    return () => request.abort();
    // `position` and `preferences` are compared by value through `key`;
    // depending on the objects themselves would refire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key]);

  const current = settled && settled.key === key ? settled : null;
  return { advice: current?.advice ?? null, pending: active && current === null };
}
