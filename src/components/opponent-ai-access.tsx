"use client";

import { useCallback, useState } from "react";
import { hasAccessEntitlement, isProductAvailable } from "@/lib/product/access-contract";
import { useAccess } from "./access-provider";

export interface OpponentAiAccess {
  readonly requestedLevel: number;
  readonly level: number;
  readonly premiumRequested: boolean;
  readonly premiumReady: boolean;
  readonly accessChecking: boolean;
  readonly accessUnavailable: boolean;
  readonly continuedAtEight: boolean;
  readonly continueAtEight: () => void;
  readonly refresh: () => Promise<"ready" | "required" | "unavailable">;
}

/** One canonical interpretation of a requested opponent level in every mode. */
export function useOpponentAiAccess(
  isAi: boolean,
  requestedLevel: number,
): OpponentAiAccess {
  const access = useAccess();
  // Keying the decision by level makes a URL change restore the newly requested
  // level without a set-state effect or a stale continuation from another match.
  const [continuedLevel, setContinuedLevel] = useState<number | null>(null);
  const continuedAtEight = continuedLevel === requestedLevel;
  const premiumRequested = isAi && requestedLevel > 8;
  const premiumReady = premiumRequested
    && !continuedAtEight
    && access.status === "ready"
    && isProductAvailable(access.snapshot, "advancedAi")
    && hasAccessEntitlement(access.snapshot, "advanced_ai")
    && requestedLevel <= access.snapshot.limits.aiMaxLevel;
  const accessChecking = premiumRequested
    && !continuedAtEight
    && (access.status === "loading" || access.refreshing);
  const accessUnavailable = premiumRequested
    && !continuedAtEight
    && access.status === "unavailable";
  const continueAtEight = useCallback(
    () => setContinuedLevel(requestedLevel),
    [requestedLevel],
  );

  return {
    requestedLevel,
    premiumRequested,
    premiumReady,
    accessChecking,
    accessUnavailable,
    continuedAtEight,
    level: premiumReady ? requestedLevel : premiumRequested ? 8 : requestedLevel,
    continueAtEight,
    refresh: async () => {
      const snapshot = await access.refresh();
      if (!snapshot) return "unavailable";
      return isProductAvailable(snapshot, "advancedAi")
        && hasAccessEntitlement(snapshot, "advanced_ai")
        && requestedLevel <= snapshot.limits.aiMaxLevel
        ? "ready"
        : "required";
    },
  };
}

/** The same entitlement outcome, phrased identically beside every scoreboard. */
export function OpponentAiAccessBanner({ access }: { access: OpponentAiAccess }) {
  if (!access.premiumRequested) return null;
  return <div
    className={`ai-access-status ${access.accessChecking
      ? "checking"
      : access.continuedAtEight
        ? "continued"
        : access.accessUnavailable
          ? "unavailable"
          : access.premiumReady
            ? "verified"
            : "required"}`}
    role={access.accessChecking || access.accessUnavailable ? "status" : undefined}
  >
    <b>{access.accessChecking
      ? "CHECKING PRO ACCESS"
      : access.continuedAtEight
        ? "LEVEL 8 CONTINUATION"
        : access.accessUnavailable
          ? "VERIFICATION UNAVAILABLE"
          : access.premiumReady
            ? "PRO AI VERIFIED"
            : "PRO REQUIRED"}</b>
    <span>{access.accessChecking
      ? "Scoring inputs are paused until Dartio verifies this level."
      : access.continuedAtEight
        ? "This match will stay on local AI level 8."
        : access.accessUnavailable
          ? "Dartio could not verify paid access, so this match is using local level 8."
          : access.premiumReady
            ? `Level ${access.requestedLevel} throws are authorized by Dartio’s server.`
            : `Level ${access.requestedLevel} needs Pro. This match is continuing at local level 8.`}</span>
  </div>;
}
